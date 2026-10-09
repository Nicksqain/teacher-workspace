import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { StudyPlanLinkService, groupKey } from './study-plan-link.service';
import type { PrismaService } from '../../core/database/prisma.service';

function setup() {
  const lesson = { id:'l',groupName:'ПР-1-26 (9 кл.)',subject:'Английский (One/Two)',room:'12',updatedAt:new Date('2026-09-22T00:00:00Z'),startsAt:new Date('2026-09-22T03:30:00Z'),endsAt:new Date('2026-09-22T04:50:00Z'),studyPlanId:null,assignmentId:null,academicHours:null };
  const plan = { id:'p',academicYear:'2026-2027',period:'2026-2027:1',semester:1,group:{name:'ПР-1-26'},subject:{name:'Английский'} };
  const assignments = [1,2].map(i=>({id:`a${i}`,studyPlanId:'p',subgroupNumber:i,teacherLabel:`Teacher ${i}`,studyPlan:plan}));
  const tx = {
    lesson:{findUnique:vi.fn(async()=>lesson),findMany:vi.fn(async()=>[]),update:vi.fn(async({data}:any)=>({...lesson,...data})),create:vi.fn(async({data}:any)=>({...data,id:'new'}))},
    studyPlanAssignment:{findMany:vi.fn(async()=>assignments)},
    studyPlanChange:{create:vi.fn(async()=>({}))},
  };
  const service=new StudyPlanLinkService({$transaction:(fn:any)=>fn(tx)} as unknown as PrismaService);
  const input={lessonId:'l',assignmentIds:['a1'],updatedAt:lesson.updatedAt.toISOString(),confirmed:true,rooms:['12']};
  return {service,tx,lesson,assignments,input};
}
describe('Schedule to RUP linking',()=>{
  it('normalizes group suffix, spaces and dashes',()=>{
    expect(groupKey(' ПР–1–26 (9 кл.) ')).toBe(groupKey('пр-1-26'));
  });
  it('links one pair with two academic hours and records history',async()=>{
    const {service,tx,input}=setup();
    const result=await service.link(input,'actor');
    expect(result.lessons[0]).toMatchObject({assignmentId:'a1',studyPlanId:'p',academicHours:2});
    expect(tx.lesson.create).not.toHaveBeenCalled();
    expect(tx.studyPlanChange.create).toHaveBeenCalled();
  });
  it('splits two subgroups atomically with separate teachers and rooms',async()=>{
    const {service,input}=setup();
    const result=await service.link({...input,assignmentIds:['a1','a2'],rooms:['12','14']},'actor');
    expect(result.lessons.map(l=>[l.assignmentId,l.room,l.academicHours])).toEqual([['a1','12',2],['a2','14',2]]);
  });
  it('rejects mixed plans, whole-group splits and stale lessons before writing',async()=>{
    const {service,tx,input,assignments}=setup();
    assignments[1].studyPlanId='other';
    await expect(service.link({...input,assignmentIds:['a1','a2'],rooms:['12','14']},'actor')).rejects.toThrow('одному предмету');
    assignments[1].studyPlanId='p';assignments[1].subgroupNumber=0;
    await expect(service.link({...input,assignmentIds:['a1','a2'],rooms:['12','14']},'actor')).rejects.toThrow('две разные');
    await expect(service.link({...input,updatedAt:'2026-09-21T00:00:00Z'},'actor')).rejects.toThrow('изменилось');
    expect(tx.lesson.update).not.toHaveBeenCalled();
  });
  it('rejects another group or academic year',async()=>{
    const {service,lesson,input,tx}=setup();
    lesson.groupName='Other';
    await expect(service.link(input,'actor')).rejects.toThrow('Группа');
    lesson.groupName='ПР-1-26'; lesson.startsAt=new Date('2025-09-22T03:30:00Z');
    await expect(service.link(input,'actor')).rejects.toThrow('учебный год');
    expect(tx.lesson.update).not.toHaveBeenCalled();
  });
});
