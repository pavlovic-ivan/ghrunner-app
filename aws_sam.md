# Github App Deployer AWS

## About
Deployer of Probot app on AWS Lambda using AWS SAM

-------------

## How does it work?

This repository uses a template.yml for the creation of the Lambda. Every env variable is set during the deploy of the Lambda. This Function has already configured the API-Trigger, so in order to attach the Function to your app just copy the API-Endpoint inside your webhook URL.

It requires **APP_ID**, **PRIVATE_KEY** and **WEBHOOK_SECRET**. This information can be retrieved from your github application settings.

----------

## Build and Deploy the function locally

Build the function:

```
  sam build
```
[Set up the env](./setup.md)

Deploy the function:

```
sam deploy --stack-name NAME-OF-THE-STACK \
  --on-failure DELETE \
  --s3-bucket YOUR-S3-BUCKET \
  --tags "tag-key"="tag-value" \
  --no-confirm-changeset \
  --parameter-overrides 'awsRole="ROLE-FOR-THE-FUNCTION" \
  functionName="YOUR-LAMBDA-FUNCTION-NAME" \
  secretId="YOUR-PREDEFINED-AWS-SECRET-ID"\
  githubOwner="OWNER-OF-THE-REPO" \
  githubRepository="NAME-OF-THE-REPO" \
  githubWorkflowName="NAME-OF-THE-WORKFLOW" \
  githubBranch="NAME-OF-THE-BRANCH" \
  githubJobFilter="NAME-OF-THE-FILTER"'
```

Delete the stack:

```
  sam delete --stack-name NAME-OF-THE-STACK --no-prompts --region REGION-OF-THE-FUNCTION
```
-------

## Update the code of your function

Every time a pushe is done, the action automatically runs the `deploy.yml`. This way your Function will always be updated. 