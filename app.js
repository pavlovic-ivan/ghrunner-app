/**
 * @param {import('probot').Probot} app
 */
const repository = process.env.REPOSITORY.split('/');
const runners_workflow = process.env.WORKFLOW_FILE_NAME;
const ref = process.env.BRANCH;
const jobFilter = process.env.JOB_FILTER;

module.exports = (app) => {
  app.on("workflow_job", async (context) => {
    if(context.payload.workflow_job.name !== null && context.payload.workflow_job.name.includes(jobFilter)){
      var action = context.payload.action === 'completed' ? context.payload.action : (context.payload.action === 'queued' ? "requested": null);
      
      if(action !== null){
        let label = context.payload.workflow_job.labels.find(jobLabel => jobLabel.includes(jobFilter));
        context.octokit.actions.createWorkflowDispatch({
          owner: repository[0],
          repo: repository[1],
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
