SHELL:=/bin/bash
function_name=ghrunner-app

build:
	cd src; \
	sam build

up: build
	sam deploy --stack-name ${function_name}-function \
		-t src/template.yml \
		--on-failure DELETE \
		--s3-bucket ${AWS_S3_BUCKET} \
		--no-confirm-changeset \
		--parameter-overrides "awsRole=${AWS_ARN_ROLE} functionName=${function_name} githubOwner=${OWNER} githubRepository=${REPO} githubWorkflowName=${WORKFLOW_FILE_NAME} githubBranch=${BRANCH} githubJobFilter=${JOB_FILTER} hostedZoneId=${HOSTED_ZONE_ID} fullDomainName=${FULL_DOMAIN_NAME} tlsCertificateArn=${TLS_CERTIFICATE_ARN}"

down:
	cd src; \
	sam delete --no-prompts --stack-name ${function_name}-function --region ${AWS_REGION}