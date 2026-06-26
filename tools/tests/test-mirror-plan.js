'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const { mirrorPlan } = require(path.join(__dirname, '..', 'mirror-images.js'));
const sample = {
  _assetBase: 'https://example.test',
  _imageUrls: [
    'Assets/CompositeDoors/Images/DoorBlanks/Door Mould 10/Thumbnails/White.jpg?ver=9.28.26',
    'Assets/CompositeDoors/Images/Handles/?ver=9.28.26' // bare folder ref — must be skipped
  ]
};
const plan = mirrorPlan(sample);
assert.equal(plan.length, 1, 'non-file URL (bare folder) is skipped');
assert.match(plan[0].localPath, /assets\/img\/endurance\/DoorBlanks\/Door Mould 10\/Thumbnails\/White\.jpg$/);
assert.equal(plan[0].url, 'https://example.test/Assets/CompositeDoors/Images/DoorBlanks/Door Mould 10/Thumbnails/White.jpg?ver=9.28.26', 'url is assetBase + original path');
console.log('mirror-plan OK');
