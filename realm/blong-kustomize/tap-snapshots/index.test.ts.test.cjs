/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports[`index.test.ts > TAP > kustomize flow (server) > plan find > planIsDeterministic > plan 1`] = `
Object {
  "assets": Array [],
  "backingServiceRequest": Object {},
  "backingServices": Array [],
  "crd": undefined,
  "deployments": Array [
    Object {
      "layers": Array [
        "kustomize.orchestrator",
        "kustomize.gateway",
      ],
      "name": "kustomize",
      "namespaces": Array [
        "kustomize",
        "login",
      ],
      "realms": Array [
        "kustomize",
      ],
      "replicas": 1,
      "resources": Object {
        "limits": Object {
          "cpu": "1",
          "memory": "512Mi",
        },
        "requests": Object {
          "cpu": "50m",
          "memory": "128Mi",
        },
      },
    },
  ],
  "externalServices": Array [],
  "ingresses": Array [],
  "install": false,
  "manifests": Array [],
  "nodes": Array [
    "node-a",
    "node-b",
  ],
  "operator": Object {
    "image": undefined,
    "ingress": undefined,
    "intervalSeconds": 60,
    "replicas": 1,
  },
  "portal": Object {},
  "profile": "realm",
  "secrets": Array [],
  "services": Array [
    Object {
      "deployment": "kustomize",
      "name": "kustomize",
      "namespace": "blong-suite",
    },
    Object {
      "deployment": "kustomize",
      "name": "login",
      "namespace": "blong-suite",
    },
  ],
  "suite": Object {
    "database": false,
    "entry": undefined,
    "frameworkImage": "ghcr.io/feasibleone/blong-gogo",
    "intents": undefined,
    "minFrameworkVersion": undefined,
    "name": "blong-suite",
    "namespace": "blong-suite",
    "version": undefined,
  },
  "suiteVolume": Object {
    "artifact": undefined,
    "attemptRetention": 5,
    "backend": "nodeLocal",
    "retention": 3,
    "rwxManifest": undefined,
    "rwxProvider": undefined,
    "storageClassName": undefined,
  },
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aChangedJobIsANewJob > jobNames 1`] = `
Object {
  "file": "deployer/migrate.yaml",
  "first": "shop-migrate-9.9.9-00cc20c1",
  "otherEntry": "shop-migrate-9.9.9-659a07dd",
  "otherVersion": "shop-migrate-9.9.10-7a6ac581",
  "regenerated": "shop-migrate-9.9.9-00cc20c1",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aCrSpecDrivesTheTree > crSpec 1`] = `
Object {
  "namedAfterTheSpec": Array [],
  "namespaces": Array [
    "namespaces/blong-suite.yaml",
  ],
  "processes": Array [
    "deployments/blong-suite.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aDeploymentBringsItsOwnServices > backingService 1`] = `
Object {
  "alias": Object {
    "apiVersion": "v1",
    "kind": "Service",
    "metadata": Object {
      "labels": Object {
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "4c623faf75bb23a7",
      },
      "name": "mysql",
      "namespace": "shop-suite",
    },
    "spec": Object {
      "externalName": "mysql.shop-services.svc.cluster.local",
      "ports": Array [
        Object {
          "name": "mysql",
          "port": 3306,
        },
      ],
      "type": "ExternalName",
    },
  },
  "claim": Object {
    "apiVersion": "v1",
    "kind": "PersistentVolumeClaim",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "a99088295630014d",
      },
      "name": "mysql-data",
      "namespace": "shop-services",
    },
    "spec": Object {
      "accessModes": Array [
        "ReadWriteOnce",
      ],
      "resources": Object {
        "requests": Object {
          "storage": "10Gi",
        },
      },
      "storageClassName": "local-path",
    },
  },
  "credentials": Object {
    "apiVersion": "v1",
    "kind": "Secret",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "5d068b02415140b6",
      },
      "name": "mysql-credentials",
      "namespace": "shop-services",
    },
    "stringData": Object {
      "MYSQL_PASSWORD": "bfb7c675e4c0982a449a68f1c",
      "MYSQL_USER": "b4bd05a5cb1393a8dfca1ec82",
    },
    "type": "Opaque",
  },
  "files": Array [
    "namespaces/shop-services.yaml",
    "services/mysql/claim.yaml",
    "services/mysql/credentials-in-suite.yaml",
    "services/mysql/credentials.yaml",
    "services/mysql/deployment.yaml",
    "services/mysql/init-config.yaml",
    "services/mysql/service.yaml",
  ],
  "init": Object {
    "apiVersion": "v1",
    "data": Object {
      "init.sql": String(
        CREATE DATABASE IF NOT EXISTS \`blong-suite\`;
        CREATE DATABASE IF NOT EXISTS \`blong-access\`;
        
      ),
    },
    "kind": "ConfigMap",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "d44f45069d78cada",
      },
      "name": "mysql-init-config",
      "namespace": "shop-services",
    },
  },
  "workload": Object {
    "apiVersion": "apps/v1",
    "kind": "Deployment",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "714490c5d90fc458",
      },
      "name": "mysql",
      "namespace": "shop-services",
    },
    "spec": Object {
      "replicas": 1,
      "selector": Object {
        "matchLabels": Object {
          "app": "mysql",
        },
      },
      "template": Object {
        "metadata": Object {
          "labels": Object {
            "app": "mysql",
          },
        },
        "spec": Object {
          "containers": Array [
            Object {
              "env": Array [
                Object {
                  "name": "MYSQL_USER",
                  "valueFrom": Object {
                    "secretKeyRef": Object {
                      "key": "MYSQL_USER",
                      "name": "mysql-credentials",
                    },
                  },
                },
                Object {
                  "name": "MYSQL_PASSWORD",
                  "valueFrom": Object {
                    "secretKeyRef": Object {
                      "key": "MYSQL_PASSWORD",
                      "name": "mysql-credentials",
                    },
                  },
                },
              ],
              "image": "mysql/mysql-server:8.0.32",
              "livenessProbe": Object {
                "exec": Object {
                  "command": Array [
                    "mysqladmin",
                    "ping",
                    "-h",
                    "127.0.0.1",
                  ],
                },
                "failureThreshold": 10,
                "initialDelaySeconds": 40,
                "periodSeconds": 30,
                "timeoutSeconds": 20,
              },
              "name": "mysql",
              "ports": Array [
                Object {
                  "containerPort": 3306,
                  "name": "mysql",
                },
              ],
              "readinessProbe": Object {
                "exec": Object {
                  "command": Array [
                    "mysqladmin",
                    "ping",
                    "-h",
                    "127.0.0.1",
                  ],
                },
                "initialDelaySeconds": 20,
                "periodSeconds": 10,
              },
              "resources": Object {
                "limits": Object {
                  "cpu": "1",
                  "memory": "768Mi",
                },
                "requests": Object {
                  "cpu": "50m",
                  "memory": "512Mi",
                },
              },
              "volumeMounts": Array [
                Object {
                  "mountPath": "/var/lib/mysql",
                  "name": "mysql-data",
                },
                Object {
                  "mountPath": "/docker-entrypoint-initdb.d",
                  "name": "mysql-init",
                },
              ],
            },
          ],
          "initContainers": Array [
            Object {
              "command": Array [
                "sh",
                "-c",
                "chown -R 27:27 /var/lib/mysql",
              ],
              "image": "busybox:1.36.1",
              "name": "volume-permissions",
              "volumeMounts": Array [
                Object {
                  "mountPath": "/var/lib/mysql",
                  "name": "mysql-data",
                },
              ],
            },
          ],
          "volumes": Array [
            Object {
              "name": "mysql-data",
              "persistentVolumeClaim": Object {
                "claimName": "mysql-data",
              },
            },
            Object {
              "configMap": Object {
                "name": "mysql-init-config",
              },
              "name": "mysql-init",
            },
          ],
        },
      },
    },
  },
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aMonolithDispatchesInsideItsOnlyProcess > profileArgs 1`] = `
Object {
  "deployment": Array [
    "/opt/deploy/suite/index.ts",
    "release",
    "--remote.canSkipSocket=true",
    "--shop.orchestrator",
  ],
  "migration": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
    "--remote.canSkipSocket=true",
  ],
  "realmDeployment": Array [
    "/opt/deploy/suite/index.ts",
    "release",
    "--shop.orchestrator",
  ],
  "realmMigration": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > anArtifactEntryIsFoundInAnyDirectory > artifactEntry 1`] = `
Object {
  "mounted": "/cache/demo/9/suite/blong-suite/index.ts",
  "none": "/cache/demo/9/index.ts",
  "relative": "/cache/demo/9/index.ts",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aSplitTreeKeepsTheArtifactOutOfTheBase > splitTree 1`] = `
Object {
  "identityInBase": false,
  "identityInBaseFiles": Array [],
  "identityInLocal": true,
  "instanceDirs": Array [
    "local/cache/blong-suite-fill-0.1.0-a1b2c3d4-node-a",
    "local/cache/blong-suite-fill-0.1.0-a1b2c3d4-node-b",
  ],
  "nodesInBase": 0,
  "nodesInLocal": 2,
  "patches": 1,
  "placeholderInBase": true,
  "placeholdersInTemplate": true,
  "realVolumeInPatch": true,
  "scriptInTemplate": true,
  "scriptMounted": false,
  "templatesInBase": 2,
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aVolumeIsNamedAfterItsArtifact > volumeIdentity 1`] = `
Object {
  "absent": "1.2.3",
  "fromDigest": "1.2.3-a1b2c3d4",
  "fromStamp": "1.2.3-88bdbb60",
  "unnamed": "1.2.3",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > eachPortalNamesItsOwnService > portalServices 1`] = `
Object {
  "files": Array [
    "services/admin-http.yaml",
    "services/adminPanel-http.yaml",
    "services/store-http.yaml",
  ],
  "ingressPaths": Array [
    Object {
      "service": Object {
        "name": "admin-http",
        "port": Object {
          "number": 8080,
        },
      },
    },
    Object {
      "service": Object {
        "name": "adminPanel-http",
        "port": Object {
          "number": 8080,
        },
      },
    },
  ],
  "selector": Object {
    "app.kubernetes.io/instance": "admin",
    "app.kubernetes.io/part-of": "shop",
  },
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > everyNamespaceTheResolverAsksForHasAService > migrationStep 1`] = `
Object {
  "args": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
  ],
  "selectors": Array [],
  "waits": Array [],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > everyNamespaceTheResolverAsksForHasAService > namespaceServices 1`] = `
Object {
  "processLabels": Object {
    "app.kubernetes.io/instance": "core",
    "app.kubernetes.io/managed-by": "blong-kustomize",
    "app.kubernetes.io/name": "shop",
    "app.kubernetes.io/part-of": "shop",
    "app.kubernetes.io/version": "9.9.9",
    "blong.feasible.one/namespace-core": "true",
    "blong.feasible.one/namespace-subject": "true",
  },
  "service": Object {
    "ports": Array [
      Object {
        "name": "rpc",
        "port": 8091,
        "protocol": "TCP",
        "targetPort": "rpc",
      },
      Object {
        "name": "http",
        "port": 8080,
        "protocol": "TCP",
        "targetPort": "http",
      },
    ],
    "selector": Object {
      "app.kubernetes.io/part-of": "shop",
      "blong.feasible.one/namespace-subject": "true",
    },
    "type": "ClusterIP",
  },
  "services": Array [
    "services/access.yaml",
    "services/core.yaml",
    "services/subject.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > everyReferenceInTheTreeResolves > danglingReferences 1`] = `
Object {
  "ingress": Array [
    "ingresses/shop.yaml: the path \\"/\\" points at Service \\"gone\\", which this tree does not define",
  ],
  "mount": Array [
    "deployments/shop.yaml: a container mounts volume \\"missing\\", which nothing declares",
  ],
  "resolved": Array [],
  "selector": Array [
    "services/other.yaml: nothing in this tree carries app.kubernetes.io/name=other",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > objectsAreFingerprinted > generatedFileCount 1`] = `
19
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > objectsAreFingerprinted > generatedTree 1`] = `
Object {
  "cache/blong-suite-fill-1.0.0-node-a.yaml": String(
    apiVersion: batch/v1
    kind: Job
    metadata:
      labels:
        app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-a
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/retention: "3"
        blong.feasible.one/spec-hash: 71383eff2f635612
        blong.feasible.one/suite-version: 1.0.0
        blong.feasible.one/volume-identity: 1.0.0
      name: blong-suite-fill-1.0.0-node-a
      namespace: blong-suite
    spec:
      backoffLimit: 1
      template:
        metadata:
          labels:
            app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-a
            app.kubernetes.io/managed-by: blong-kustomize
            app.kubernetes.io/name: blong-suite
            app.kubernetes.io/part-of: blong-suite
            app.kubernetes.io/version: 1.0.0
        spec:
          containers:
            - command:
                - sh
                - -c
                - |-
                  set -eu
                  : "\${BLONG_ARTIFACT_ROOT:?a root is required}" "\${BLONG_ARTIFACT_IDENTITY:?an identity is required}" "\${BLONG_ARTIFACT_KEEP:?a count is required}"
                  target="$BLONG_ARTIFACT_ROOT"/"$BLONG_ARTIFACT_IDENTITY"
                  staging="$BLONG_ARTIFACT_ROOT"/.staging-"$BLONG_ARTIFACT_IDENTITY"
                  mkdir -p "$BLONG_ARTIFACT_ROOT"
                  if [ -f "$target/.blong-artifact-ready" ]; then exit 0; fi
                  rm -rf "$staging"
                  mkdir -p "$staging"
                  if [ -n "\${BLONG_ARTIFACT_PATH:-}" ]; then cp -R "$BLONG_ARTIFACT_PATH"/. "$staging"/
                  else curl -fsSL "$BLONG_ARTIFACT_URL" -o /tmp/suite.zip
                  unzip -oq /tmp/suite.zip -d "$staging"
                  fi
                  if [ -f "$staging"/create-links.js ]; then (cd "$staging" && node create-links.js create); fi
                  node -e 'const fs=require("fs"),path=require("path");const root=process.argv[1];let n=0;const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isSymbolicLink()){const t=fs.readlinkSync(p);if(path.isAbsolute(t)){fs.unlinkSync(p);fs.symlinkSync(path.relative(d,t),p);n++}}else if(e.isDirectory())walk(p)}};walk(root);console.log("relative links: "+n)' "$staging"
                  rm -rf "$target"
                  mv "$staging" "$target"
                  touch "$target/.blong-artifact-ready"
                  cd "$BLONG_ARTIFACT_ROOT" && ls -1dt */ 2>/dev/null | tail -n +$(( $BLONG_ARTIFACT_KEEP + 1 )) | while read -r gone; do rm -rf "\${gone}"; done
                  find "$BLONG_ARTIFACT_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.staging-*' -mmin +60 -exec rm -rf {} + 2>/dev/null || true
              env:
                - name: BLONG_ARTIFACT_ROOT
                  value: /var/lib/blong/suites/blong-suite
                - name: BLONG_ARTIFACT_IDENTITY
                  value: 1.0.0
                - name: BLONG_ARTIFACT_KEEP
                  value: "3"
                - name: BLONG_ARTIFACT_URL
                  value: ""
              image: ghcr.io/feasibleone/blong-gogo:latest
              name: fill
              resources:
                limits:
                  cpu: "1"
                  memory: 512Mi
                requests:
                  cpu: 50m
                  memory: 128Mi
              securityContext:
                runAsUser: 0
              volumeMounts:
                - mountPath: /var/lib/blong/suites/blong-suite
                  name: suite
          nodeSelector:
            kubernetes.io/hostname: node-a
          restartPolicy: Never
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite
                type: DirectoryOrCreate
              name: suite
    
  ),
  "cache/blong-suite-fill-1.0.0-node-b.yaml": String(
    apiVersion: batch/v1
    kind: Job
    metadata:
      labels:
        app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-b
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/retention: "3"
        blong.feasible.one/spec-hash: 0b85e3229b00f55e
        blong.feasible.one/suite-version: 1.0.0
        blong.feasible.one/volume-identity: 1.0.0
      name: blong-suite-fill-1.0.0-node-b
      namespace: blong-suite
    spec:
      backoffLimit: 1
      template:
        metadata:
          labels:
            app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-b
            app.kubernetes.io/managed-by: blong-kustomize
            app.kubernetes.io/name: blong-suite
            app.kubernetes.io/part-of: blong-suite
            app.kubernetes.io/version: 1.0.0
        spec:
          containers:
            - command:
                - sh
                - -c
                - |-
                  set -eu
                  : "\${BLONG_ARTIFACT_ROOT:?a root is required}" "\${BLONG_ARTIFACT_IDENTITY:?an identity is required}" "\${BLONG_ARTIFACT_KEEP:?a count is required}"
                  target="$BLONG_ARTIFACT_ROOT"/"$BLONG_ARTIFACT_IDENTITY"
                  staging="$BLONG_ARTIFACT_ROOT"/.staging-"$BLONG_ARTIFACT_IDENTITY"
                  mkdir -p "$BLONG_ARTIFACT_ROOT"
                  if [ -f "$target/.blong-artifact-ready" ]; then exit 0; fi
                  rm -rf "$staging"
                  mkdir -p "$staging"
                  if [ -n "\${BLONG_ARTIFACT_PATH:-}" ]; then cp -R "$BLONG_ARTIFACT_PATH"/. "$staging"/
                  else curl -fsSL "$BLONG_ARTIFACT_URL" -o /tmp/suite.zip
                  unzip -oq /tmp/suite.zip -d "$staging"
                  fi
                  if [ -f "$staging"/create-links.js ]; then (cd "$staging" && node create-links.js create); fi
                  node -e 'const fs=require("fs"),path=require("path");const root=process.argv[1];let n=0;const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isSymbolicLink()){const t=fs.readlinkSync(p);if(path.isAbsolute(t)){fs.unlinkSync(p);fs.symlinkSync(path.relative(d,t),p);n++}}else if(e.isDirectory())walk(p)}};walk(root);console.log("relative links: "+n)' "$staging"
                  rm -rf "$target"
                  mv "$staging" "$target"
                  touch "$target/.blong-artifact-ready"
                  cd "$BLONG_ARTIFACT_ROOT" && ls -1dt */ 2>/dev/null | tail -n +$(( $BLONG_ARTIFACT_KEEP + 1 )) | while read -r gone; do rm -rf "\${gone}"; done
                  find "$BLONG_ARTIFACT_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.staging-*' -mmin +60 -exec rm -rf {} + 2>/dev/null || true
              env:
                - name: BLONG_ARTIFACT_ROOT
                  value: /var/lib/blong/suites/blong-suite
                - name: BLONG_ARTIFACT_IDENTITY
                  value: 1.0.0
                - name: BLONG_ARTIFACT_KEEP
                  value: "3"
                - name: BLONG_ARTIFACT_URL
                  value: ""
              image: ghcr.io/feasibleone/blong-gogo:latest
              name: fill
              resources:
                limits:
                  cpu: "1"
                  memory: 512Mi
                requests:
                  cpu: 50m
                  memory: 128Mi
              securityContext:
                runAsUser: 0
              volumeMounts:
                - mountPath: /var/lib/blong/suites/blong-suite
                  name: suite
          nodeSelector:
            kubernetes.io/hostname: node-b
          restartPolicy: Never
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite
                type: DirectoryOrCreate
              name: suite
    
  ),
  "cache/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - blong-suite-fill-1.0.0-node-a.yaml
      - blong-suite-fill-1.0.0-node-b.yaml
    
  ),
  "deployments/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - kustomize.yaml
    
  ),
  "deployments/kustomize.yaml": String(
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      labels:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 40eb52309aa3bc3e
      name: kustomize
      namespace: blong-suite
    spec:
      replicas: 1
      selector:
        matchLabels:
          app.kubernetes.io/instance: kustomize
          app.kubernetes.io/part-of: blong-suite
      template:
        metadata:
          labels:
            app.kubernetes.io/instance: kustomize
            app.kubernetes.io/managed-by: blong-kustomize
            app.kubernetes.io/name: blong-suite
            app.kubernetes.io/part-of: blong-suite
            app.kubernetes.io/version: 1.0.0
            blong.feasible.one/namespace-kustomize: "true"
            blong.feasible.one/namespace-login: "true"
        spec:
          containers:
            - args:
                - /opt/deploy/suite/index.ts
                - release
                - --kustomize.orchestrator
                - --kustomize.gateway
              env:
                - name: BLONG_ENV
                  value: release
                - name: BLONG_NAMESPACE
                  valueFrom:
                    fieldRef:
                      fieldPath: metadata.namespace
              image: ghcr.io/feasibleone/blong-gogo:latest
              livenessProbe:
                tcpSocket:
                  port: rpc
              name: blong
              ports:
                - containerPort: 8091
                  name: rpc
                  protocol: TCP
                - containerPort: 8080
                  name: http
                  protocol: TCP
              readinessProbe:
                tcpSocket:
                  port: rpc
              resources:
                limits:
                  cpu: "1"
                  memory: 512Mi
                requests:
                  cpu: 50m
                  memory: 128Mi
              volumeMounts:
                - mountPath: /opt/deploy/suite
                  name: suite
                  readOnly: true
                - mountPath: /home/node/.blong_releaserc
                  name: releaserc-home
                  readOnly: true
                  subPath: .blong_releaserc
                - mountPath: /etc/blong_releaserc
                  name: releaserc-site
                  readOnly: true
                  subPath: blong_releaserc
                - mountPath: /home/node/.config/blong_release/
                  name: gateway-keys
                  readOnly: true
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite/1.0.0
                type: Directory
              name: suite
            - name: releaserc-home
              secret:
                items:
                  - key: .blong_releaserc
                    path: .blong_releaserc
                optional: true
                secretName: blong-releaserc
            - name: releaserc-site
              secret:
                items:
                  - key: blong_releaserc
                    path: blong_releaserc
                optional: true
                secretName: blong-releaserc-etc
            - name: gateway-keys
              secret:
                items:
                  - key: config
                    path: config
                optional: true
                secretName: gateway-keys
    
  ),
  "kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    labels:
      - includeSelectors: false
        pairs:
          app.kubernetes.io/managed-by: blong-kustomize
          app.kubernetes.io/name: blong-suite
          app.kubernetes.io/part-of: blong-suite
          app.kubernetes.io/version: 1.0.0
    namespace: blong-suite
    resources:
      - cache
      - deployments
      - namespaces
      - rbac
      - services
    
  ),
  "namespaces/blong-suite.yaml": String(
    apiVersion: v1
    kind: Namespace
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 838762d903bd204e
      name: blong-suite
    
  ),
  "namespaces/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - blong-suite.yaml
    
  ),
  "rbac/auth-review-binding.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRoleBinding
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 07abb2e08cee26f1
      name: blong-suite-auth-review
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: ClusterRole
      name: auth-review
    subjects:
      - kind: ServiceAccount
        name: blong
        namespace: blong-suite
    
  ),
  "rbac/auth-review.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRole
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 504dbf06c5055a3a
      name: auth-review
    rules:
      - apiGroups:
          - authentication.k8s.io
        resources:
          - tokenreviews
        verbs:
          - create
      - apiGroups:
          - authorization.k8s.io
        resources:
          - subjectaccessreviews
        verbs:
          - create
    
  ),
  "rbac/blong-operator-role.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: Role
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 382363f64bfa9406
      name: blong-operator
      namespace: blong-suite
    rules:
      - apiGroups:
          - ""
        resources:
          - services
          - configmaps
          - secrets
          - persistentvolumeclaims
        verbs: &a1
          - get
          - list
          - watch
          - create
          - update
          - patch
          - delete
      - apiGroups:
          - apps
        resources:
          - deployments
          - daemonsets
          - statefulsets
        verbs: *a1
      - apiGroups:
          - batch
        resources:
          - jobs
          - cronjobs
        verbs: *a1
      - apiGroups:
          - networking.k8s.io
        resources:
          - ingresses
          - networkpolicies
        verbs: *a1
    
  ),
  "rbac/blong-operator-rolebinding.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 6dba5a6ef9a5508a
      name: blong-operator
      namespace: blong-suite
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: Role
      name: blong-operator
    subjects:
      - kind: ServiceAccount
        name: blong-operator
        namespace: blong-system
    
  ),
  "rbac/jobs-role.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: Role
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: ae973ba705a2275c
      name: jobs
      namespace: blong-suite
    rules:
      - apiGroups:
          - batch
        resources:
          - jobs
          - cronjobs
        verbs:
          - get
          - list
          - watch
      - apiGroups:
          - ""
          - apps
          - networking.k8s.io
        resources:
          - pods
          - services
          - endpoints
          - deployments
          - daemonsets
          - replicasets
          - ingresses
        verbs:
          - get
          - list
          - watch
    
  ),
  "rbac/jobs-rolebinding.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: dd7fe97723651d28
      name: jobs
      namespace: blong-suite
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: Role
      name: jobs
    subjects:
      - kind: ServiceAccount
        name: blong
        namespace: blong-suite
    
  ),
  "rbac/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - auth-review-binding.yaml
      - auth-review.yaml
      - blong-operator-role.yaml
      - blong-operator-rolebinding.yaml
      - jobs-role.yaml
      - jobs-rolebinding.yaml
      - service-account.yaml
    
  ),
  "rbac/service-account.yaml": String(
    apiVersion: v1
    kind: ServiceAccount
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 1a9031474c2206ca
      name: blong
      namespace: blong-suite
    
  ),
  "services/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - kustomize.yaml
      - login.yaml
    
  ),
  "services/kustomize.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 10724c0b6fb6ad1e
      name: kustomize
      namespace: blong-suite
    spec:
      ports:
        - name: rpc
          port: 8091
          protocol: TCP
          targetPort: rpc
        - name: http
          port: 8080
          protocol: TCP
          targetPort: http
      selector:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/part-of: blong-suite
      type: ClusterIP
    
  ),
  "services/login.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 43f676f758986c93
      name: login
      namespace: blong-suite
    spec:
      ports:
        - name: rpc
          port: 8091
          protocol: TCP
          targetPort: rpc
        - name: http
          port: 8080
          protocol: TCP
          targetPort: http
      selector:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/part-of: blong-suite
      type: ClusterIP
    
  ),
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > olderJobAttemptsArePrunedByRetention > obsolescence 1`] = `
Object {
  "sweptKinds": 11,
  "versionNamedLeftAlone": Array [
    "the-alias",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > olderJobAttemptsArePrunedByRetention > prunable 1`] = `
Object {
  "deploymentInsideTheSuite": Array [
    "in-the-suite-too",
  ],
  "insideSuite": Array [
    "in-the-suite",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > olderJobAttemptsArePrunedByRetention > retention 1`] = `
Object {
  "attemptFallback": 5,
  "belowRetention": Array [],
  "declared": 3,
  "deploymentReplaced": true,
  "jobReplaced": false,
  "pastRetention": Array [
    "shop-migrate-0",
    "shop-migrate-1",
  ],
  "volumeFallback": 3,
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > oneIngressPerHost > ingresses 1`] = `
Object {
  "hosts": Object {
    "ingresses/api-shop-example.yaml": Object {
      "annotations": undefined,
      "host": "api.shop.example",
      "paths": Array [
        Object {
          "backend": Object {
            "service": Object {
              "name": "api-svc",
              "port": Object {
                "number": 8080,
              },
            },
          },
          "path": "/",
          "pathType": "Prefix",
        },
      ],
      "tls": Array [
        Object {
          "hosts": Array [
            "api.shop.example",
          ],
          "secretName": "api-tls",
        },
      ],
    },
    "ingresses/hooks-shop-example.yaml": Object {
      "annotations": undefined,
      "host": "hooks.shop.example",
      "paths": Array [
        Object {
          "backend": Object {
            "service": Object {
              "name": "shop",
              "port": Object {
                "number": 8080,
              },
            },
          },
          "path": "/webhook",
          "pathType": "Prefix",
        },
      ],
      "tls": undefined,
    },
    "ingresses/ui-shop-example.yaml": Object {
      "annotations": Object {
        "nginx.ingress.kubernetes.io/auth-realm": "blong deployment UI",
        "nginx.ingress.kubernetes.io/auth-secret": "ui-auth",
        "nginx.ingress.kubernetes.io/auth-type": "basic",
      },
      "host": "ui.shop.example",
      "paths": Array [
        Object {
          "backend": Object {
            "service": Object {
              "name": "store-http",
              "port": Object {
                "number": 8080,
              },
            },
          },
          "path": "/shop",
          "pathType": "Prefix",
        },
      ],
      "tls": undefined,
    },
  },
  "ingressFiles": Array [
    "ingresses/api-shop-example.yaml",
    "ingresses/hooks-shop-example.yaml",
    "ingresses/ui-shop-example.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theAttemptNameIgnoresHowTheIntentsWereSpelled > attemptNames 1`] = `
Object {
  "debug": "-migrate-9.9.9-c420b00d",
  "legacy": "-migrate-9.9.9-21cd426e",
  "omitted": "-migrate-9.9.9-21cd426e",
  "spelled": "-migrate-9.9.9-21cd426e",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theClusterSuppliesTheConfigurationAsFiles > clusterConfiguration 1`] = `
Object {
  "deployments/kustomize.yaml": Array [
    Object {
      "env": Array [
        "BLONG_ENV=release",
        "BLONG_NAMESPACE=undefined",
      ],
      "mounts": Array [
        Object {
          "mountPath": "/opt/deploy/suite",
          "optional": undefined,
          "secretName": undefined,
        },
        Object {
          "mountPath": "/home/node/.blong_releaserc",
          "optional": true,
          "secretName": "blong-releaserc",
        },
        Object {
          "mountPath": "/etc/blong_releaserc",
          "optional": true,
          "secretName": "blong-releaserc-etc",
        },
        Object {
          "mountPath": "/home/node/.config/blong_release/",
          "optional": true,
          "secretName": "gateway-keys",
        },
      ],
    },
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theMigrationStepReadsTheFileItMounts > migrationArgs 1`] = `
Object {
  "args": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
  ],
  "custom": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "custom",
    "release",
  ],
  "devOnly": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "upgrade",
    "release",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theOperatorIsInstalledOnceForTheCluster > operatorInstall 1`] = `
Object {
  "addressedIngress": Object {
    "apiVersion": "networking.k8s.io/v1",
    "kind": "Ingress",
    "metadata": Object {
      "labels": Object {
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "blong-operator",
        "app.kubernetes.io/part-of": "blong-operator",
        "app.kubernetes.io/version": "0.1.0",
        "blong.feasible.one/spec-hash": "acdfe2e9caec044f",
      },
      "name": "blong-operator-test",
      "namespace": "blong-system",
    },
    "spec": Object {
      "rules": Array [
        Object {
          "host": "blong-operator.test",
          "http": Object {
            "paths": Array [
              Object {
                "backend": Object {
                  "service": Object {
                    "name": "blong-operator",
                    "port": Object {
                      "number": 8080,
                    },
                  },
                },
                "path": "/",
                "pathType": "Prefix",
              },
            ],
          },
        },
      ],
    },
  },
  "authReview": Array [
    Array [
      "tokenreviews",
      Array [
        "create",
      ],
    ],
    Array [
      "subjectaccessreviews",
      Array [
        "create",
      ],
    ],
  ],
  "installFiles": Array [
    "cache/kustomization.yaml",
    "cache/shop-fill-0.1.0-node-a.yaml",
    "cache/shop-fill-0.1.0-node-b.yaml",
    "crd/blongdeployment-crd.yaml",
    "crd/kustomization.yaml",
    "deployments/blong-operator.yaml",
    "deployments/kustomization.yaml",
    "kustomization.yaml",
    "namespaces/blong-system.yaml",
    "namespaces/kustomization.yaml",
    "rbac/blong-operator-clusterrole.yaml",
    "rbac/blong-operator-clusterrolebinding.yaml",
    "rbac/blong-operator-role.yaml",
    "rbac/blong-operator-rolebinding.yaml",
    "rbac/blong-operator-service-account.yaml",
    "rbac/kustomization.yaml",
    "services/blong-operator.yaml",
    "services/kustomization.yaml",
    "volumes/blong-operator-artifacts.yaml",
    "volumes/kustomization.yaml",
  ],
  "ports": Array [
    Object {
      "name": "rpc",
      "port": 8091,
      "protocol": "TCP",
      "targetPort": "rpc",
    },
    Object {
      "name": "http",
      "port": 8080,
      "protocol": "TCP",
      "targetPort": "http",
    },
  ],
  "selector": Object {
    "app.kubernetes.io/instance": "blong-operator",
    "app.kubernetes.io/part-of": "blong-operator",
  },
  "suiteFiles": Array [
    "blongdeployment.yaml",
    "cache/kustomization.yaml",
    "cache/shop-fill-0.1.0-node-a.yaml",
    "cache/shop-fill-0.1.0-node-b.yaml",
    "kustomization.yaml",
    "namespaces/kustomization.yaml",
    "namespaces/shop-suite.yaml",
    "rbac/auth-review-binding.yaml",
    "rbac/auth-review.yaml",
    "rbac/blong-operator-role.yaml",
    "rbac/blong-operator-rolebinding.yaml",
    "rbac/jobs-role.yaml",
    "rbac/jobs-rolebinding.yaml",
    "rbac/kustomization.yaml",
    "rbac/service-account.yaml",
  ],
  "waits": Array [],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theTreeCarriesWhatARealmDeclares > realmDeclarations 1`] = `
Object {
  "generatedFolders": Array [
    "assets/kustomization.yaml",
    "secrets/kustomization.yaml",
  ],
  "mounted": Array [
    Object {
      "hostPath": Object {
        "path": "/var/lib/blong/suites/shop/0.1.0",
        "type": "Directory",
      },
      "name": "suite",
    },
    Object {
      "name": "shop-data",
      "persistentVolumeClaim": Object {
        "claimName": "shop-data",
      },
    },
    Object {
      "name": "releaserc-home",
      "secret": Object {
        "items": Array [
          Object {
            "key": ".blong_releaserc",
            "path": ".blong_releaserc",
          },
        ],
        "optional": true,
        "secretName": "blong-releaserc",
      },
    },
    Object {
      "name": "releaserc-site",
      "secret": Object {
        "items": Array [
          Object {
            "key": "blong_releaserc",
            "path": "blong_releaserc",
          },
        ],
        "optional": true,
        "secretName": "blong-releaserc-etc",
      },
    },
    Object {
      "name": "gateway-keys",
      "secret": Object {
        "items": Array [
          Object {
            "key": "config",
            "path": "config",
          },
        ],
        "optional": true,
        "secretName": "gateway-keys",
      },
    },
  ],
  "mounts": Array [
    Array [
      Object {
        "mountPath": "/opt/deploy/suite",
        "name": "suite",
        "readOnly": true,
      },
      Object {
        "mountPath": "/var/lib/shop",
        "name": "shop-data",
      },
      Object {
        "mountPath": "/home/node/.blong_releaserc",
        "name": "releaserc-home",
        "readOnly": true,
        "subPath": ".blong_releaserc",
      },
      Object {
        "mountPath": "/etc/blong_releaserc",
        "name": "releaserc-site",
        "readOnly": true,
        "subPath": "blong_releaserc",
      },
      Object {
        "mountPath": "/home/node/.config/blong_release/",
        "name": "gateway-keys",
        "readOnly": true,
      },
    ],
  ],
  "secret": Object {
    "apiVersion": "kustomize.config.k8s.io/v1beta1",
    "kind": "Kustomization",
    "namespace": "shop-suite",
    "secretGenerator": Array [
      Object {
        "envs": Array [
          "shop-db.env",
        ],
        "name": "shop-db",
      },
    ],
  },
  "volumes": Array [
    "volumes/kustomization.yaml",
    "volumes/shop-data.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theVersionLabelIsTheSuitesOwn > versionLabels 1`] = `
Object {
  "declared": "9.8.7",
  "realm": "0.1.0",
  "unversioned": "0.1.0",
}
`
