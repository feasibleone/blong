#! /bin/bash

tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.k8s
RESULT_K8S=$?

tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.http
RESULT_HTTP=$?

if ! ../../test/integration/wait.sh mongodb; then
  echo "wait.sh failed for MongoDB, skipping."
  RESULT_MONGODB=1
else
  tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.mongodb
  RESULT_MONGODB=$?
fi

if ! ../../test/integration/wait.sh mysql; then
  echo "wait.sh failed for MySQL, skipping."
  RESULT_MYSQL=1
else
  tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.mysql
  RESULT_MYSQL=$?
fi

if ! ../../test/integration/wait.sh minio; then
  echo "wait.sh failed for minio, skipping."
  RESULT_S3=1
else
  tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.s3
  RESULT_S3=$?
fi

if ! ../../test/integration/wait.sh keycloak; then
  echo "wait.sh failed for Keycloak, skipping."
  RESULT_KEYCLOAK=1
else
  tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.keycloak
  RESULT_KEYCLOAK=$?
fi

if ! ../../test/integration/wait.sh vault; then
  echo "wait.sh failed for Vault, skipping."
  RESULT_VAULT=1
else
  tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.vault
  RESULT_VAULT=$?
fi

if ! ../../test/integration/wait.sh kafka; then
  echo "wait.sh failed for Kafka, skipping."
  RESULT_KAFKA=1
else
  tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.kafka
  RESULT_KAFKA=$?
fi

# report list of failed tests
if [ $RESULT_HTTP -ne 0 ] || [ $RESULT_K8S -ne 0 ] || [ $RESULT_KAFKA -ne 0 ] || [ $RESULT_KEYCLOAK -ne 0 ] || [ $RESULT_MONGODB -ne 0 ] || [ $RESULT_MYSQL -ne 0 ] || [ $RESULT_S3 -ne 0 ] || [ $RESULT_VAULT -ne 0 ]; then
  echo "Integration tests failed. Results:"
  echo "HTTP: $RESULT_HTTP"
  echo "K8S: $RESULT_K8S"
  echo "Kafka: $RESULT_KAFKA"
  echo "Keycloak: $RESULT_KEYCLOAK"
  echo "MongoDB: $RESULT_MONGODB"
  echo "MySQL: $RESULT_MYSQL"
  echo "S3: $RESULT_S3"
  echo "Vault: $RESULT_VAULT"
  exit 1
else
  echo "All integration tests passed successfully."
fi
