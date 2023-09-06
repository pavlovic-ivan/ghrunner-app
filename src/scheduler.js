const nodeCron = require('node-cron');

nodeCron.schedule('* * * * * *', () => {
  // This job will run every second
  console.log(new Date().toLocaleTimeString());
})