/**
 * @param {import('probot').Probot} app
 */
const owner = "pavlovic-ivan";
const repo = "ILGPU";
const runners_workflow = "runners.yaml";
const ref = "master";

module.exports = (app) => {
  app.on("workflow_job", async (context) => {
    if(context.payload.workflow_job.name !== null && context.payload.workflow_job.name.includes('cuda')){
      var action = context.payload.action === 'completed' ? context.payload.action : (context.payload.action === 'queued' ? "requested": null);
      
      if(action !== null){
        let label = context.payload.workflow_job.labels.find(jobLabel => jobLabel.includes('cuda'));
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
            label: jobLabel
          }
        }); 
      }
    }
  });
};
