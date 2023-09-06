const nodeCron = require('node-cron');

module.exports = function(){
    nodeCron.schedule('* * * * * *', () => {
        // This job will run every second
        console.log(new Date().toLocaleTimeString());
      })
}
