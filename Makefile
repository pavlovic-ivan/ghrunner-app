SHELL:=/bin/bash
name=ghrunner-app-function
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
		--set-env-vars 'REPOSITORY=${REPOSITORY},WORKFLOW_FILE_NAME=${WORKFLOW_FILE_NAME},BRANCH=${BRANCH},JOB_FILTER=${JOB_FILTER}' \
		--set-secrets 'APP_ID=APP_ID:latest,PRIVATE_KEY=PRIVATE_KEY:latest,WEBHOOK_SECRET=WEBHOOK_SECRET:latest'
	gcloud beta functions add-iam-policy-binding ${name} \
		--member="allUsers" \
		--role="roles/cloudfunctions.invoker"