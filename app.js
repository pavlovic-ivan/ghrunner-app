/**
 * @param {import('probot').Probot} app
 */
const owner = process.env.OWNER; 
const repo = process.env.REPO;
const runners_workflow = process.env.WORKFLOW_FILE_NAME;
const ref = process.env.BRANCH;
const jobFilter = process.env.JOB_FILTER;

module.exports = (app) => {
  app.on("workflow_job", async (context) => {
    if(context.payload.workflow_job.name !== null && context.payload.workflow_job.name.includes(jobFilter)){
      console.log(`Console Event by job: ${context.payload.job_id}`);
      app.log.log(`App Event by job: ${context.payload.job_id}`);

      var action = context.payload.action === 'completed' ? context.payload.action : (context.payload.action === 'queued' ? "requested": null);
      
      if(action !== null){
        // let label = context.payload.workflow_job.labels.find(jobLabel => jobLabel.includes(jobFilter));
        let job_name = context.payload.workflow_job.name;
        var label = job_name
          .substring(job_name.indexOf("(") + 1, job_name.lastIndexOf(")"))
          .split(' ')
          .join('');

        context.octokit.actions.createWorkflowDispatch({
          owner: owner,
          repo: repo,
          workflow_id: runners_workflow,
          ref: ref,
          inputs: {
            action: action,
            run_id: context.payload.workflow_job.run_id.toString(),
            run_attempt: context.payload.workflow_job.run_attempt.toString(),
            job_id: context.payload.workflow_job.id.toString(),
            label: label
          }
        }); 
      }
    }
  });
};
