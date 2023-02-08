SHELL:=/bin/bash
function_name=ghrunner-app

build-sam:
	sam build

deploy-aws: build-sam
	sam deploy --stack-name ${function_name}-function \
		--on-failure DELETE \
		--s3-bucket ${AWS_S3_BUCKET} \
		--no-confirm-changeset \
		--parameter-overrides "awsRole=${AWS_ARN_ROLE} functionName=${function_name} githubOwner=${OWNER} githubRepository=${REPO} githubWorkflowName=${WORKFLOW_FILE_NAME} githubBranch=${BRANCH} githubJobFilter=${JOB_FILTER}"