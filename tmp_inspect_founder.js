import fs from 'fs';

const store = JSON.parse(fs.readFileSync('private/founder/runtime-store.json', 'utf8'));

console.log("Revision:", store.revision);

const weightEntries = store.weightEntries || [];
const recentWeights = weightEntries.slice(-5);
console.log("\nRecent weightEntries:");
recentWeights.forEach(w => console.log(JSON.stringify(w)));

const executionItems = store.executionItems || [];
const foamRolling = executionItems.filter(i => JSON.stringify(i).toLowerCase().includes('foam')).slice(-5);
console.log("\nRecent Foam Rolling executionItems:");
foamRolling.forEach(i => console.log(JSON.stringify(i)));

const dailyCheckIns = store.dailyCheckIns || [];
const recentCheckIns = dailyCheckIns.slice(-2);
console.log("\nRecent dailyCheckIns:");
recentCheckIns.forEach(c => console.log(JSON.stringify(c)));

console.log("\nChecking for duplicates in weightEntries (by date/time):");
const weightDates = new Set();
let weightDups = 0;
weightEntries.forEach(w => {
  const d = w.measuredAt || w.date || w.id;
  if (weightDates.has(d)) {
    console.log("Duplicate found:", JSON.stringify(w));
    weightDups++;
  }
  weightDates.add(d);
});
if (weightDups === 0) console.log("No exact duplicates found.");

console.log("\nChecking for duplicates in executionItems:");
const execIds = new Set();
let execDups = 0;
executionItems.forEach(i => {
  if (execIds.has(i.id)) {
    console.log("Duplicate found:", JSON.stringify(i));
    execDups++;
  }
  execIds.add(i.id);
});
if (execDups === 0) console.log("No exact duplicates found.");
