#!/bin/bash

su - runner -c "cd runner && \
                  ./config.sh \
                    --url https://github.com/{{owner}}/{{repo}} \
                    --name {{runner_name}} \
                    --token {{token}} \
                    --labels {{labels}} \
                    --disableupdate \
                    --unattended \
                    --ephemeral"

cd ~runner/runner
./svc.sh install runner
./svc.sh start