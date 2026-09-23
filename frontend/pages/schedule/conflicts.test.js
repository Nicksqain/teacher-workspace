import test from 'node:test';
import assert from 'node:assert/strict';
import { teachersOf, roomsOf, findConflicts } from './conflicts.js';
const lesson = (id, overrides = {}) => ({ id, groupName: id, subject: 'Математика (Иванова А.Б.)', room: '12', startsAt: '2026-09-22T08:30:00+05:00', endsAt: '2026-09-22T09:50:00+05:00', ...overrides });

test('same teacher in different rooms and groups is a teacher conflict', () => {
 const result = findConflicts([lesson('a'), lesson('b', {room:'13', subject:'Физика (Иванова А. Б.)'})]);
 assert.equal(result.get('a').length, 1); assert.equal(result.get('a')[0].type, 'teacher'); assert.equal(result.get('b')[0].peerId, 'a');
});
test('different teachers in same room is a room conflict', () => {
 const result = findConflicts([lesson('a'),lesson('b',{subject:'Физика (Петров В.Г.)',room:'12 каб'})]);
 assert.deepEqual(result.get('a').map(x=>x.type), ['room']);
});
test('partial time overlap counts; adjacent pairs and different dates do not', () => {
 assert.equal(findConflicts([lesson('a'),lesson('b',{startsAt:'2026-09-22T09:00:00+05:00'})]).get('a').length,2);
 assert.equal(findConflicts([lesson('a'),lesson('b',{startsAt:'2026-09-22T09:50:00+05:00',endsAt:'2026-09-22T11:20:00+05:00'})]).get('a').length,0);
 assert.equal(findConflicts([lesson('a'),lesson('b',{startsAt:'2026-09-23T08:30:00+05:00',endsAt:'2026-09-23T09:50:00+05:00'})]).get('a').length,0);
});
test('subgroup teachers and multiple rooms are considered individually', () => {
 const result=findConflicts([lesson('a',{subject:'Информатика (Иванова А.Б./Петров В.Г.)',room:'3/13 каб'}),lesson('b',{subject:'Физика (Петров В. Г.)',room:'13'})]);
 assert.deepEqual(result.get('a').map(x=>x.type),['teacher','room']);
});
test('surname only is possible, different initials do not match',()=>{
 assert.equal(findConflicts([lesson('a'),lesson('b',{subject:'Физика (Иванова)',room:'13'})]).get('a')[0].possible,true);
 assert.equal(findConflicts([lesson('a'),lesson('b',{subject:'Физика (Иванова В.Г.)',room:'13'})]).get('a').length,0);
});
test('module numbers are not teachers; unknown rooms are not conflicts',()=>{
 assert.equal(teachersOf('ПМ 1 (РО 1.1, РО 1.3) (спорт.площадка)').length,0);
 assert.deepEqual(roomsOf('Не указана'),[]);
 assert.equal(findConflicts([lesson('a',{subject:'ПМ 1',room:'Не указана'}),lesson('b',{subject:'ПМ 2',room:'Не указана'})]).get('a').length,0);
 assert.equal(roomsOf('01а каб')[0].key,roomsOf('1a')[0].key);
});
test('editing a time or teacher removes obsolete conflicts',()=>{
 const a=lesson('a');const b=lesson('b',{room:'13'});
 assert.equal(findConflicts([a,b]).get('a').length,1);
 assert.equal(findConflicts([a,{...b,subject:'Физика (Петров В.Г.)'}]).get('a').length,0);
});
test('no self conflict and bad intervals are ignored',()=>{
 assert.equal(findConflicts([lesson('a')]).get('a').length,0);
 assert.equal(findConflicts([lesson('a'),lesson('b',{endsAt:'invalid'})]).get('a').length,0);
});
