SHELL:=/bin/bash
name=ghrunner-app-function
aws_function_name=ghrunner-app
aws_stack_name=ghapp-stack
aws_s3_bucket=parquetsharp-dev-sam-templates
project=
service_account=

deploy:
	gcloud beta functions deploy ${name} \
		--runtime nodejs16 \
		--trigger-http \
		--entry-point probotApp \
		--quiet \
		--project ${project} \
		--service-account=${service_account} \
		--set-env-vars 'OWNER=${OWNER},REPO=${REPO},WORKFLOW_FILE_NAME=${WORKFLOW_FILE_NAME},BRANCH=${BRANCH},JOB_FILTER=${JOB_FILTER}' \
		--set-secrets 'APP_ID=APP_ID:latest,PRIVATE_KEY=PRIVATE_KEY:latest,WEBHOOK_SECRET=WEBHOOK_SECRET:latest'
	gcloud beta functions add-iam-policy-binding ${name} \
		--member="allUsers" \
		--role="roles/cloudfunctions.invoker"

build-sam:
	sam build

deploy-aws: build-sam
	sam deploy --stack-name ${aws_stack_name} \
	--on-failure DELETE \
	--s3-bucket ${aws_s3_bucket} \
	--tags map-migrated=d-server-01068mdjl5jze3 \
	--no-confirm-changeset \
	--parameter-overrides 'awsRole="${AWS_ARN_ROLE}" \
	functionName="${aws_function_name}" \
	secretId="${AWS_SECRET_ID}"
	githubOwner="${OWNER}" \
	githubRepository="${REPO}" \
	githubWorkflowName="${WORKFLOW_FILE_NAME}" \
	githubBranch="${BRANCH}" \
	githubJobFilter="${JOB_FILTER}"' \
	