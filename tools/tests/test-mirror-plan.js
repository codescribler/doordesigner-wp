'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const { mirrorPlan } = require(path.join(__dirname, '..', 'mirror-images.js'));
const sample = { _imageUrls: ['Assets/CompositeDoors/Images/DoorBlanks/Door Mould 10/Thumbnails/White.jpg?ver=9.28.26'] };
const plan = mirrorPlan(sample);
assert.equal(plan.length, 1);
assert.match(plan[0].localPath, /assets\/img\/endurance\/DoorBlanks\/Door Mould 10\/Thumbnails\/White\.jpg$/);
console.log('mirror-plan OK');
