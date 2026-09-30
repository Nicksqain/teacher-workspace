import { BadRequestException, ConflictException, Inject, Injectable, StreamableFile } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { Prisma } from '../../generated/prisma/client';

type Row = { subject: string; groupName: string; room: string; startsAt: Date; endsAt: Date };
const text = (cell: ExcelJS.Cell) => cell.text.trim();
const key = (row: Row) => `${row.groupName}|${row.startsAt.toISOString()}`;
function dateOnly(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new BadRequestException('Укажите корректную дату');
  return value;
}
function validate(row: Row) {
  if (!row.subject || !row.groupName || !row.room || !Number.isFinite(+row.startsAt) || !(row.endsAt > row.startsAt)) throw new BadRequestException('В файле есть незаполненные поля или неверное время');
  return row;
}
export async function parseWorkbook(file: unknown, day: string): Promise<Row[]> {
  if (typeof file !== 'string' || file.length > 6000000 || !/^[A-Za-z0-9+/=]+$/.test(file)) throw new BadRequestException('Выберите файл .xlsx до 4 МБ');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(Buffer.from(file,'base64') as unknown as ExcelJS.Buffer); }
  catch { throw new BadRequestException('Не удалось прочитать .xlsx'); }
  const rows: Row[] = [];
  const data = workbook.getWorksheet('Занятия');
  if (data) {
    if (text(data.getCell('A1')) !== 'Группа' || text(data.getCell('D1')) !== 'Начало (ISO)') throw new BadRequestException('Неверный формат листа «Занятия»');
    const dataRows: number[] = [];
    data.eachRow((row, r) => { if (r > 1 && [1,2,3,4,5].some(c => text(row.getCell(c)))) dataRows.push(r); });
    if (dataRows.length > 2000) throw new BadRequestException('Максимум 2000 занятий');
    for(const r of dataRows) {
      const values = [1,2,3,4,5].map(c=>text(data.getCell(r,c)));
      if(values.every(v=>!v)) continue;
      if(!values[3].endsWith('+05:00') && !values[3].endsWith('Z')) throw new BadRequestException(`Строка ${r}: начало должно содержать часовой пояс`);
      if(!values[4].endsWith('+05:00') && !values[4].endsWith('Z')) throw new BadRequestException(`Строка ${r}: окончание должно содержать часовой пояс`);
      rows.push(validate({groupName:values[0],subject:values[1],room:values[2],startsAt:new Date(values[3]),endsAt:new Date(values[4])}));
    }
  } else {
    const sheet=workbook.worksheets[0];
    if(!sheet) throw new BadRequestException('В файле нет листов с расписанием');
    const groups = new Map<number,string>();
    sheet.getRow(3).eachCell((cell,c) => { const name=text(cell); if(c>=4 && name) groups.set(c,name); });
    if(!groups.size)throw new BadRequestException('Группы должны находиться в строке 3, начиная со столбца D');
    const lessonRows: number[] = [];
    sheet.eachRow((row,r) => { if(r>=4 && [...groups.keys()].some(c => { const value=text(row.getCell(c)); return value && !['-','—'].includes(value); })) lessonRows.push(r); });
    if(groups.size>2000 || lessonRows.length>2000) throw new BadRequestException('Максимум 2000 занятий');
    for(const r of lessonRows) {
      const range=text(sheet.getCell(r,3));
      const match=range.match(/^(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})$/);
      const occupied=[...groups.keys()].some(c=>text(sheet.getCell(r,c)));
      if(!match){if(occupied)throw new BadRequestException(`Строка ${r}: неверное время в столбце C`);continue;}
      const start=`${match[1].padStart(2,'0')}:${match[2]}`;const end=`${match[3].padStart(2,'0')}:${match[4]}`;
      for(const [c,groupName] of groups){
        const original=text(sheet.getCell(r,c)); if(!original || ['-','—'].includes(original))continue;
        const room=original.match(/\(([^()]*)\)\s*\/?\s*$/);
        const isRoom=room && /каб|площад|мастер|конференц|^\s*\d/i.test(room[1]);
        rows.push(validate({groupName,subject:isRoom?original.slice(0,room!.index).trim():original,room:isRoom?room![1].trim():'Не указана',startsAt:new Date(`${day}T${start}:00+05:00`),endsAt:new Date(`${day}T${end}:00+05:00`)}));
      }
    }
  }
  if(!rows.length || rows.length>2000)throw new BadRequestException('Файл должен содержать от 1 до 2000 занятий');
  const min=+new Date(`${day}T00:00:00+05:00`),max=min+86400000;
  if(rows.some(r=>+r.startsAt<min || +r.startsAt>=max || +r.endsAt>max))throw new BadRequestException('Дата занятий не совпадает с выбранным днём');
  const keys=rows.map(key);if(new Set(keys).size!==keys.length)throw new BadRequestException('В файле повторяется группа с одинаковым началом пары. Объедините подгруппы в одной ячейке.');
  return rows;
}
function plan(rows: Row[], existing: Array<Row & {id:string;updatedAt:Date}>) {
  const mapped=new Map<string,typeof existing>();
  for(const row of existing){const k=key(row);mapped.set(k,[...(mapped.get(k)??[]),row]);}
  const actions=rows.map(row=>{
    const matches=mapped.get(key(row))??[];
    if(matches.length>1)throw new ConflictException(`В базе несколько пар: ${row.groupName}, ${row.startsAt.toISOString()}`);
    const old=matches[0];
    const action=!old?'create':old.subject===row.subject&&old.room===row.room&&+old.endsAt===+row.endsAt?'skip':'update';
    return {...row,action,id:old?.id,version:old?.updatedAt.toISOString()};
  });
  const fingerprint=createHash('sha256').update(JSON.stringify(actions)).digest('hex');
  return {rows:actions,fingerprint,counts:{create:actions.filter(r=>r.action==='create').length,update:actions.filter(r=>r.action==='update').length,skip:actions.filter(r=>r.action==='skip').length}};
}
@Injectable()
export class ScheduleExcelService {
  constructor(@Inject(PrismaService) private readonly prisma:PrismaService){}
  async preview(body: any) {
    const day=dateOnly(body?.date);const rows=await parseWorkbook(body?.file,day);
    const existing=await this.prisma.lesson.findMany({where:{startsAt:{gte:new Date(`${day}T00:00:00+05:00`),lt:new Date(+new Date(`${day}T00:00:00+05:00`)+86400000)}}});
    return plan(rows,existing);
  }
  async commit(body:any) {
    const day=dateOnly(body?.date);const rows=await parseWorkbook(body?.file,day);
    if(typeof body?.fingerprint!=='string')throw new BadRequestException('Сначала выполните предпросмотр');
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.lesson.findMany({where:{startsAt:{gte:new Date(`${day}T00:00:00+05:00`),lt:new Date(+new Date(`${day}T00:00:00+05:00`)+86400000)}}});
      const current=plan(rows,existing);
      if(current.fingerprint!==body.fingerprint)throw new ConflictException('Расписание изменилось. Выполните предпросмотр заново.');
      for(const item of current.rows){const {action,id,version,...data}=item;
        if(action==='create')await tx.lesson.create({data});
        if(action==='update')await tx.lesson.update({where:{id},data});
      }
      const lessons = await tx.lesson.findMany({where:{startsAt:{gte:new Date(`${day}T00:00:00+05:00`),lt:new Date(+new Date(`${day}T00:00:00+05:00`)+86400000)}}});
      return {...current.counts, date: day, lessons};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:20000}).catch(error=>{
      if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2034')throw new ConflictException('Параллельное изменение. Повторите предпросмотр.');
      throw error;
    });
  }
  async export(body:any) {
    const day=dateOnly(body?.date);
    if(!Array.isArray(body?.ids)||!body.ids.length||body.ids.length>2000||body.ids.some((id:unknown)=>typeof id!=='string'))throw new BadRequestException('Нет занятий для экспорта');
    const rows=await this.prisma.lesson.findMany({where:{id:{in:body.ids}},orderBy:[{startsAt:'asc'},{groupName:'asc'}]});
    if(!rows.length)throw new BadRequestException('Занятия не найдены');
    const workbook=new ExcelJS.Workbook();
    const sheet=workbook.addWorksheet('Расписание');
    sheet.getCell('A1').value=`Расписание ${day}. Для обратного импорта редактируйте лист «Занятия».`;
    sheet.getCell('B3').value='Пара';sheet.getCell('C3').value='Время';
    const groups=[...new Set(rows.map(r=>r.groupName))];
    groups.forEach((name,i)=>{sheet.getCell(3,i+4).value=name;sheet.getColumn(i+4).width=38;});
    const slots=[...new Set(rows.map(r=>`${r.startsAt.toISOString()}|${r.endsAt.toISOString()}`))];
    const time=(value:Date)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Qyzylorda',hour:'2-digit',minute:'2-digit'}).format(value);
    slots.forEach((slot,i)=>{const [start,end]=slot.split('|');sheet.getCell(i+4,2).value=i+1;sheet.getCell(i+4,3).value=`${time(new Date(start))}–${time(new Date(end))}`;sheet.getRow(i+4).height=105;
      groups.forEach((group,j)=>{sheet.getCell(i+4,j+4).value=rows.filter(r=>r.groupName===group&&r.startsAt.toISOString()===start&&r.endsAt.toISOString()===end).map(r=>`${r.subject}\n(${r.room})`).join('\n\n');});
    });
    sheet.getColumn(3).width=18;sheet.views=[{state:'frozen',xSplit:3,ySplit:3}];
    const data=workbook.addWorksheet('Занятия');
    data.addRow(['Группа','Предмет и преподаватель','Кабинет','Начало (ISO)','Окончание (ISO)']);
    rows.forEach(r=>data.addRow([r.groupName,r.subject,r.room,r.startsAt.toISOString(),r.endsAt.toISOString()]));
    [30,75,25,28,28].forEach((width,i)=>data.getColumn(i+1).width=width);data.views=[{state:'frozen',ySplit:1}];
    for(const ws of [sheet,data])ws.eachRow((row,r)=>row.eachCell(cell=>{cell.alignment={vertical:'top',wrapText:true};cell.font={name:'Calibri',size:11};if(r===(ws===sheet?3:1)){cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF26344F'}};cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};}cell.border={bottom:{style:'thin',color:{argb:'FFE0E5EF'}}};}));
    const buffer=await workbook.xlsx.writeBuffer();
    return new StreamableFile(Buffer.from(buffer),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',disposition:`attachment; filename="schedule-${day}.xlsx"`});
  }
}
