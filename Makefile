SHELL:=/bin/bash
function_name=ghrunner-app
timestamp=$(shell date +%Y%m%d%H%M%S)

prepare:
	cd src; \
	jinja2 jinja-template.j2 -D NOTIFICATION_EMAIL="${NOTIFICATION_EMAIL}" -o template.yml

build: prepare
	cd src; \
	sam build

up: build
	sam deploy --stack-name ${function_name}-function \
		-t src/template.yml \
		--on-failure DELETE \
		--s3-bucket ${AWS_S3_BUCKET} \
		--no-confirm-changeset \
		--debug \
		--image-repository ${ECR_REPO}/ghrunner-app \
		--capabilities CAPABILITY_IAM \
		--parameter-overrides "awsRole=${AWS_ARN_ROLE} functionName=${function_name} hostedZoneId=${HOSTED_ZONE_ID} fullDomainName=${FULL_DOMAIN_NAME} tlsCertificateArn=${TLS_CERTIFICATE_ARN} pulumiBackendUrl=${PULUMI_BACKEND_URL} ecrRepo=${ECR_REPO}/ghrunner-app timestamp=${timestamp} maxStackAgeInMinutes=${MAX_STACK_AGE_IN_MINUTES} maxStateFileAgeInMinutes=${MAX_STATE_FILE_AGE_IN_MINUTES} cleanupScheduleExpression='${ROGUE_INSTANCE_CLEANUP_SCHEDULE}' remoteStateFileCleanupScheduleExpression='${REMOTE_STATE_FILES_CLEANUP_SCHEDULE}'" \
		|| exit 1

down:
	cd src; \
	sam delete --no-prompts --s3-bucket ${AWS_S3_BUCKET} --stack-name ${function_name}-function --region ${AWS_REGION} \
	|| exit 1