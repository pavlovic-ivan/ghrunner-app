const { createOrDelete } = require("../infra")
const uuid = require("uuid");
const { convertYamlToJson } = require('./util');

/**
 * @param {import('probot').Probot} app
 */
const probotApp = async (app) => {
  app.on("workflow_job", async (context) => {

    if(Array.isArray(context.payload.workflow_job.labels) && context.payload.workflow_job.labels.length > 0){
      var labels = context.payload.workflow_job.labels.join(',');

      const configPerLabel = convertYamlToJson(process.env.RUN_CTX === 'test' ? 'config.test.yml' : 'config.yml')

      if(configPerLabel.hasOwnProperty(labels)){
        console.info(`CtxID=[${context.id}]. JobID=[${context.payload.workflow_job.id}]. Labels=[${labels}]. Message=Received workflow job is a candidate for self hosted runners. JobUrl=[${context.payload.workflow_job.url}]`);
        console.log(`Received event from job: ${context.payload.workflow_job.id}. Action: ${context.payload.action}. Name: ${context.payload.workflow_job.name}`);
        var action = context.payload.action === 'completed' ? context.payload.action : (context.payload.action === 'queued' ? "requested": null);
        
        if(action !== null){
          console.log(`Job: ${context.payload.workflow_job.id}. Action: ${action}. Name: ${context.payload.workflow_job.name}. Run id: ${context.payload.workflow_job.run_id.toString()}. Run attempt: ${context.payload.workflow_job.run_attempt.toString()}. Labels: ${labels}`);

          try {
            let stack_name; 
            if(action === "completed"){
              stack_name = context.payload.workflow_job.runner_name;
            } else {
              stack_name = `ghrunner-${uuid.v4()}`;
            }

            let repo_full_name = context.payload.repository.full_name.split('/');
            let config = {
              machineType: configPerLabel[labels].machineType,
              machineImage: configPerLabel[labels].machineImage,
              bootDiskSizeInGB: configPerLabel[labels].bootDiskSizeInGB,
              bootDiskType: configPerLabel[labels].bootDiskType,
              owner: repo_full_name[0],
              repo: repo_full_name[1],
              labels: labels
            }

            await createOrDelete(context, action, stack_name, config);
          } catch (error) {
            console.log(`Error occured while trying to destroy/create infrastructure. Error: ${error}`);
          }
        }
      }else {
        console.debug(`CtxID=[${context.id}]. JobID=[${context.payload.workflow_job.id}]. Labels=[${labels}]. Message=Received workflow job is not a candidate for self hosted runners. JobUrl=[${context.payload.workflow_job.url}]`);
      }
    }
  });
}

module.exports = probotApp;