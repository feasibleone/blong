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
        "srv.orchestrator",
      ],
      "name": "kustomize",
      "namespaces": Array [
        "kustomize",
        "identity",
        "login",
        "session",
      ],
      "realms": Array [
        "kustomize",
        "srv",
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
      "name": "identity",
      "namespace": "blong-suite",
    },
    Object {
      "deployment": "kustomize",
      "name": "login",
      "namespace": "blong-suite",
    },
    Object {
      "deployment": "kustomize",
      "name": "session",
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
        "blong.feasible.one/generated-credentials": "true",
        "blong.feasible.one/spec-hash": "cede31e07e6e7e45",
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
    "local/suite/cache/blong-suite-fill-0.1.0-a1b2c3d4-node-a",
    "local/suite/cache/blong-suite-fill-0.1.0-a1b2c3d4-node-b",
  ],
  "moduleInBase": false,
  "namespacesInBase": 0,
  "nodesInBase": 0,
  "nodesInLocal": 2,
  "patches": 1,
  "placeholderInBase": true,
  "placeholdersInTemplate": true,
  "realVolumeInPatch": true,
  "rootNamesNamespace": false,
  "scriptInTemplate": false,
  "scriptMounted": true,
  "suiteChildNamespace": true,
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
23
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
        blong.feasible.one/spec-hash: b01fb66f425efc29
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
                - node
                - /script/fill.mts
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
                - mountPath: /script
                  name: fill-script
                  readOnly: true
          nodeSelector:
            kubernetes.io/hostname: node-a
          restartPolicy: Never
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite
                type: DirectoryOrCreate
              name: suite
            - configMap:
                name: fill-script
              name: fill-script
    
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
        blong.feasible.one/spec-hash: 53b695dce95b4142
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
                - node
                - /script/fill.mts
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
                - mountPath: /script
                  name: fill-script
                  readOnly: true
          nodeSelector:
            kubernetes.io/hostname: node-b
          restartPolicy: Never
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite
                type: DirectoryOrCreate
              name: suite
            - configMap:
                name: fill-script
              name: fill-script
    
  ),
  "cache/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - blong-suite-fill-1.0.0-node-a.yaml
      - blong-suite-fill-1.0.0-node-b.yaml
    
  ),
  "configmaps/fill-script.yaml": String(
    apiVersion: v1
    binaryData:
      fill.mts: LyoqCiAqIGZpbGwudHMg4oCUIGJyaW5nIGEgc3VpdGUgYXJ0aWZhY3QgdG8gd2hlcmUgaXQgaXMgcmVhZCBmcm9tLCBhcyBvbmUgcHJvZ3JhbSB3aXRoIHR3byBjYWxsZXJzLgogKgogKiBUaGUgb3BlcmF0b3IgZmV0Y2hlcyBhbiBhcnRpZmFjdCBpbnRvIGl0cyBvd24gY2FjaGUgd2hpbGUgaXQgcGxhbnMsIGFuZCBhIG5vZGUncyBmaWxsIEpvYiBzdGFnZXMgb25lCiAqIGJlc2lkZSB0aGUgZGlyZWN0b3J5IGl0IHdpbGwgb2NjdXB5IGFuZCByZW5hbWVzIGl0IGludG8gcGxhY2UuIFRoZXkgbXVzdCBhZ3JlZSBhYm91dCB3aGF0IGFuIGFydGlmYWN0CiAqIGlzIGFuZCB3aGF0IG1ha2VzIGl0IHdob2xlLCBzbyB0aGUgcGllY2VzIOKAlCBmZXRjaCwgdW5wYWNrLCBsaW5rLCBtYWtlIHBvcnRhYmxlLCBtYXJrLCByZXRhaW4g4oCUIGFyZQogKiBkZWZpbmVkIG9uY2UgaGVyZSBhbmQgZGlmZmVyIG9ubHkgaW4gd2hhdCBhIGNhbGxlciBwYXNzZXMuIFRoZSBzYW1lIGZpbGUgaXMgd2hhdCB0aGUgY29udGFpbmVyIHJ1bnM6CiAqIGl0IGlzIG1vdW50ZWQgaW50byB0aGUgZmlsbCBKb2IgYW5kIHN0YXJ0ZWQgd2l0aCBgbm9kZWAsIHdoaWNoIGlzIHRoZSB3aG9sZSByZWFzb24gdGhpcyBpcyBhIG1vZHVsZQogKiByYXRoZXIgdGhhbiB0aGUgc2hlbGwgaXQgcmVwbGFjZXMuIFRoYXQgc2hlbGwgbmVlZGVkIGBjdXJsYCwgYHVuemlwYCwgYGZpbmRgLCBgbHNgIGFuZCBgbXZgIHRvIGV4aXN0IGluCiAqIHRoZSBmcmFtZXdvcmsgaW1hZ2UsIGFuZCB0aGUgaW1hZ2UgaW5zdGFsbGVkIHR3byBvZiB0aGVtIGZvciBubyBvdGhlciByZWFzb24g4oCUIHNvIHRoZSBkZXBsb3kgcGF0aAogKiBkZXBlbmRlZCBvbiBzaGVsbCB0b29saW5nIHRoYXQgaGFzIG5vdGhpbmcgdG8gZG8gd2l0aCB0aGUgYXJ0aWZhY3QgKEQtNTE4KS4KICoKICogTm90aGluZyBoZXJlIGltcG9ydHMgYW55dGhpbmcgYnV0IGBub2RlOipgLCB3aGljaCBpcyB3aGF0IGxldHMgb25lIGZpbGUgYmUgYm90aCBhIGxpYnJhcnkgYW5kIGEKICogcHJvZ3JhbTogYSBtb3VudGVkIGNvcHkgaGFzIG5vIGBub2RlX21vZHVsZXNgIGFib3ZlIGl0IGFuZCBjb3VsZCByZXNvbHZlIG5vIGRlcGVuZGVuY3kgb2Ygb3Vycy4KICovCmltcG9ydCB7ZXhlY0ZpbGVTeW5jfSBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnOwppbXBvcnQgewogICAgY2xvc2VTeW5jLAogICAgY29weUZpbGVTeW5jLAogICAgY3JlYXRlUmVhZFN0cmVhbSwKICAgIGNyZWF0ZVdyaXRlU3RyZWFtLAogICAgZXhpc3RzU3luYywKICAgIGZzdGF0U3luYywKICAgIG1rZGlyU3luYywKICAgIG9wZW5TeW5jLAogICAgcmVhZGRpclN5bmMsCiAgICByZWFkbGlua1N5bmMsCiAgICByZWFkU3luYywKICAgIHJlYWxwYXRoU3luYywKICAgIHJlbmFtZVN5bmMsCiAgICBybVN5bmMsCiAgICBzdGF0U3luYywKICAgIHN5bWxpbmtTeW5jLAogICAgdW5saW5rU3luYywKICAgIHdyaXRlRmlsZVN5bmMsCn0gZnJvbSAnbm9kZTpmcyc7CmltcG9ydCB7dG1wZGlyfSBmcm9tICdub2RlOm9zJzsKaW1wb3J0IHtkaXJuYW1lLCBpc0Fic29sdXRlLCBqb2luLCByZWxhdGl2ZX0gZnJvbSAnbm9kZTpwYXRoJzsKaW1wb3J0IHtSZWFkYWJsZX0gZnJvbSAnbm9kZTpzdHJlYW0nOwppbXBvcnQge3BpcGVsaW5lfSBmcm9tICdub2RlOnN0cmVhbS9wcm9taXNlcyc7CmltcG9ydCB7ZmlsZVVSTFRvUGF0aH0gZnJvbSAnbm9kZTp1cmwnOwppbXBvcnQge2NyZWF0ZUluZmxhdGVSYXd9IGZyb20gJ25vZGU6emxpYic7Ci8qKiBUaGUgc2V0dGluZ3MgdGhlIGZpbGwgcmVhZHMgZnJvbSBpdHMgZW52aXJvbm1lbnQ6IHRoZSBKb2IncyBjb250cmFjdCwgdW5jaGFuZ2VkIGJ5IHRoaXMgbW9kdWxlLiAqLwpleHBvcnQgY29uc3QgRklMTF9FTlYgPSB7CiAgICByb290OiAnQkxPTkdfQVJUSUZBQ1RfUk9PVCcsCiAgICBpZGVudGl0eTogJ0JMT05HX0FSVElGQUNUX0lERU5USVRZJywKICAgIGtlZXA6ICdCTE9OR19BUlRJRkFDVF9LRUVQJywKICAgIHVybDogJ0JMT05HX0FSVElGQUNUX1VSTCcsCiAgICBwYXRoOiAnQkxPTkdfQVJUSUZBQ1RfUEFUSCcsCn0gYXMgY29uc3Q7CgovKioKICogVGhlIGZpbGUgdGhhdCBtYXJrcyBhbiBhcnRpZmFjdCBhcyB3aG9sZS4KICoKICogT3VyIG93biwgbm90IG9uZSBvZiB0aGUgYXJjaGl2ZSdzOiBpdCBpcyB3cml0dGVuIGFmdGVyIHRoZSB1bnBhY2sgKmFuZCogdGhlIGxpbmsgc3RlcCwgc28gaXRzIHByZXNlbmNlCiAqIGlzIHRoZSBvbmUgdGhpbmcgYSByZWFkZXIgY2FuIHRydXN0IGFib3V0IHRoZSBkaXJlY3RvcnkuCiAqLwpleHBvcnQgY29uc3QgQVJUSUZBQ1RfUkVBRFkgPSAnLmJsb25nLWFydGlmYWN0LXJlYWR5JzsKCi8qKiBSdXNoJ3MgbGluayBzY3JpcHQsIGF0IHRoZSByb290IG9mIGV2ZXJ5IGFydGlmYWN0LCBhbmQgdGhlIHJlYXNvbiB0aGUgbGluayBzdGVwIGlzIGl0cyBvd24gcGllY2UuICovCmNvbnN0IExJTktfU0NSSVBUID0gJ2NyZWF0ZS1saW5rcy5qcyc7CgovKiogQSBmaWxsLCBhcyB0aGUgdHdvIGNhbGxlcnMgYXNrIGZvciBvbmUuICovCmV4cG9ydCBpbnRlcmZhY2UgSUZpbGxSZXF1ZXN0IHsKICAgIC8qKiBUaGUgc291cmNlOiBhIFVSTCB0byBkb3dubG9hZCwgb3IgYSBwYXRoIHRvIGNvcHkuIGBwYXRoYCB3aW5zIHdoZW4gYm90aCBhcmUgZ2l2ZW4uICovCiAgICBzb3VyY2U6IHt1cmw/OiBzdHJpbmc7IHBhdGg/OiBzdHJpbmd9OwogICAgLyoqIFRoZSBkaXJlY3RvcnkgdGhlIGFydGlmYWN0IGJlbG9uZ3MgaW4uICovCiAgICB0YXJnZXQ6IHN0cmluZzsKICAgIC8qKgogICAgICogS2VlcCB0aGUgbmV3ZXN0IGBrZWVwYCBkaXJlY3RvcmllcyB1bmRlciB0aGUgdGFyZ2V0J3MgcGFyZW50LCBhbmQgZGVsZXRlIHRoZSByZXN0LgogICAgICoKICAgICAqIE9taXR0ZWQgYnkgYSBjYWxsZXIgd2hvc2UgbmVpZ2hib3VycyBhcmUgbm90IGl0cyBvd24gdG8gcmVtb3ZlOiB0aGUgYHNoYXJlZGAgYmFja2VuZCdzIHNlZWQgSm9iCiAgICAgKiBmaWxscyBhIGNsYWltIGF0IGl0cyBtb3VudCBwb2ludCwgd2hlcmUgb3RoZXIgZGlyZWN0b3JpZXMgYmVsb25nIHRvIHdob2V2ZXIgbW91bnRzIHRoZSBzYW1lIGNsYWltLgogICAgICovCiAgICBrZWVwPzogbnVtYmVyOwp9CgovKiogVGhlIG9mZnNldHMgb2YgYSB6aXAncyBjZW50cmFsIGRpcmVjdG9yeSwgd2hpY2ggaXMgd2hlcmUgZXZlcnkgZW50cnkgaXMgZGVzY3JpYmVkLiAqLwpjb25zdCBFTkRfT0ZfQ0VOVFJBTF9ESVJFQ1RPUlkgPSAweDA2MDU0YjUwOwpjb25zdCBDRU5UUkFMX0ZJTEVfSEVBREVSID0gMHgwMjAxNGI1MDsKCi8qKgogKiBXaGVyZSBhIHppcCdzIGNlbnRyYWwgZGlyZWN0b3J5IHJlY29yZCBzdGFydHMsIGZvdW5kIGZyb20gdGhlIGVuZCBvZiB0aGUgYnl0ZXMgZ2l2ZW4uCiAqCiAqIFRoZSBjYWxsZXIgcGFzc2VzIHRoZSBhcmNoaXZlJ3MgKnRhaWwqIHJhdGhlciB0aGFuIHRoZSBhcmNoaXZlLCBzbyB0aGF0IGZpbmRpbmcgdGhlIHJlY29yZCBkb2VzIG5vdCBtZWFuCiAqIHJlYWRpbmcgc2l4IGh1bmRyZWQgbWVnYWJ5dGVzIHRvIGxvb2sgYXQgdGhlIGxhc3QgZmV3IGJ5dGVzIG9mIHRoZW0uCiAqLwpjb25zdCBlbmRPZkNlbnRyYWxEaXJlY3RvcnkgPSAodGFpbDogQnVmZmVyKTogbnVtYmVyID0+IHsKICAgIGZvciAobGV0IGF0ID0gdGFpbC5sZW5ndGggLSAyMjsgYXQgPj0gMDsgYXQtLSkgewogICAgICAgIGlmICh0YWlsLnJlYWRVSW50MzJMRShhdCkgPT09IEVORF9PRl9DRU5UUkFMX0RJUkVDVE9SWSkgcmV0dXJuIGF0OwogICAgfQogICAgdGhyb3cgbmV3IEVycm9yKCd0aGUgYXJjaGl2ZSBoYXMgbm8gZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IHJlY29yZDogaXQgaXMgbm90IGEgemlwJyk7Cn07CgovKiogVGhlIGJ5dGVzIGF0IGFuIG9mZnNldCBvZiBhbiBvcGVuIGZpbGUsIHdoaWNoIGlzIGhvdyB0aGlzIHJlYWRlciB3YWxrcyBhbiBhcmNoaXZlIGl0IG5ldmVyIGhvbGRzLiAqLwpjb25zdCByZWFkQXQgPSAoZmQ6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogQnVmZmVyID0+IHsKICAgIGNvbnN0IGJ5dGVzID0gQnVmZmVyLmFsbG9jKGxlbmd0aCk7CiAgICByZWFkU3luYyhmZCwgYnl0ZXMsIDAsIGxlbmd0aCwgb2Zmc2V0KTsKICAgIHJldHVybiBieXRlczsKfTsKCi8qKgogKiBVbnBhY2sgYSB6aXAgaW50byBhIGRpcmVjdG9yeSB0aGF0IGlzIGFscmVhZHkgdGhlcmUuCiAqCiAqIFdyaXR0ZW4gaGVyZSByYXRoZXIgdGhhbiB0YWtlbiBmcm9tIGEgbGlicmFyeSwgYmVjYXVzZSB0aGUgY29weSBvZiB0aGlzIGZpbGUgdGhhdCBydW5zIGluc2lkZSBhIGZpbGwgSm9iCiAqIGlzIG1vdW50ZWQgaW50byBhIGRpcmVjdG9yeSB3aXRoIG5vIGBub2RlX21vZHVsZXNgIGFib3ZlIGl0OiBhbnkgZGVwZW5kZW5jeSB3b3VsZCBoYXZlIHRvIGJlIGluc3RhbGxlZAogKiBpbnRvIHRoZSBmcmFtZXdvcmsgaW1hZ2UsIHdoaWNoIGlzIHRoZSBjb3VwbGluZyB0aGlzIG1vZHVsZSBleGlzdHMgdG8gZW5kLiBXaGF0IGEgemlwIG5lZWRzIGlzIGEKICogY2VudHJhbCBkaXJlY3Rvcnkgd2FsayBhbmQgYHpsaWJgJ3MgaW5mbGF0ZSwgYm90aCBvZiB3aGljaCBhcmUgaGVyZS4KICoKICogUmVmdXNlZCByYXRoZXIgdGhhbiBndWVzc2VkIGF0OiBhbiBlbmNyeXB0ZWQgZW50cnksIGFuIGVudHJ5IHRoYXQgbGVhdmVzIHRoZSBkaXJlY3RvcnksIGFuZCBhIHppcDY0CiAqIGVudHJ5LCB3aG9zZSBzaXplcyBsaXZlIGluIGFuIGV4dHJhIGZpZWxkIHRoaXMgcmVhZGVyIGRvZXMgbm90IHJlYWQuIEEgc3VpdGUgYXJ0aWZhY3QgaXMgYSBkZXBsb3kKICogb3V0cHV0IG9mIGEgZmV3IGh1bmRyZWQgbWVnYWJ5dGVzLCBzbyBub25lIG9mIHRoZSB0aHJlZSBpcyBhIGNhc2UgYSByZWxlYXNlIGhhcyB0byBzdXJ2aXZlLgogKgogKiBTdHJlYW1lZCBlbnRyeSBieSBlbnRyeSwgYW5kIHRoYXQgaXMgbm90IGEgcHJlZmVyZW5jZTogdGhlIHN1aXRlIGFydGlmYWN0IGluIHRoaXMgcmVwb3NpdG9yeSBpcyA2NTMgTUIsCiAqIHdoaWxlIHRoZSBmaWxsIEpvYiB0aGF0IHVucGFja3MgaXQgcnVucyB1bmRlciBhIDUxMiBNaUIgbGltaXQuIFJlYWRpbmcgdGhlIGFyY2hpdmUgaW50byBtZW1vcnkgaXMgd2hhdAogKiB0aGUgZmlyc3QgdmVyc2lvbiBvZiB0aGlzIGRpZCDigJQgdGhlIHBvZHMgd2VyZSBPT01LaWxsZWQgcGFydC13YXkgdGhyb3VnaCB0aGUgdW5wYWNrLCBsZWF2aW5nIGEKICogaGFsZi13cml0dGVuIHN0YWdpbmcgZGlyZWN0b3J5IG9uIGVhY2ggbm9kZSBhbmQgZXZlcnkgcmVhZGVyIHdhaXRpbmcgZm9yIGFuIGlkZW50aXR5IHRoYXQgbmV2ZXIKICogYXBwZWFyZWQsIGFuZCBhIGZpbGwgdGhhdCBkaWVzIGxpa2UgdGhhdCBsb29rcyBsaWtlIGEgZmlsbCB0aGF0IHN1Y2NlZWRlZCB1bnRpbCBzb21lYm9keSByZWFkcyB0aGUKICogbm9kZSAoZm91bmQgaW4gdGhlIGRldiBjbHVzdGVyLCBULTMxOCkuCiAqLwpleHBvcnQgY29uc3QgdW5wYWNrWmlwID0gYXN5bmMgKGFyY2hpdmU6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHsKICAgIGNvbnN0IGZkID0gb3BlblN5bmMoYXJjaGl2ZSwgJ3InKTsKICAgIHRyeSB7CiAgICAgICAgY29uc3Qgc2l6ZSA9IGZzdGF0U3luYyhmZCkuc2l6ZTsKICAgICAgICBjb25zdCB0YWlsTGVuZ3RoID0gTWF0aC5taW4oc2l6ZSwgMjIgKyAweGZmZmYpOwogICAgICAgIGNvbnN0IGVuZCA9CiAgICAgICAgICAgIHNpemUgLSB0YWlsTGVuZ3RoICsgZW5kT2ZDZW50cmFsRGlyZWN0b3J5KHJlYWRBdChmZCwgc2l6ZSAtIHRhaWxMZW5ndGgsIHRhaWxMZW5ndGgpKTsKICAgICAgICBjb25zdCBjb3VudCA9IHJlYWRBdChmZCwgZW5kICsgMTAsIDIpLnJlYWRVSW50MTZMRSgwKTsKICAgICAgICBjb25zdCBkaXJlY3RvcnlTaXplID0gcmVhZEF0KGZkLCBlbmQgKyAxMiwgNCkucmVhZFVJbnQzMkxFKDApOwogICAgICAgIGNvbnN0IGRpcmVjdG9yeVN0YXJ0ID0gcmVhZEF0KGZkLCBlbmQgKyAxNiwgNCkucmVhZFVJbnQzMkxFKDApOwogICAgICAgIC8vIFRoZSBkaXJlY3RvcnkgaXMgdGhlIG9uZSBwYXJ0IHRoYXQgaXMgcmVhZCB3aG9sZSwgYW5kIGl0IGhvbGRzIGEgZmV3IGRvemVuIGJ5dGVzIHBlciBlbnRyeS4KICAgICAgICBpZiAoCiAgICAgICAgICAgIGRpcmVjdG9yeVNpemUgPT09IDB4ZmZmZmZmZmYgfHwKICAgICAgICAgICAgZGlyZWN0b3J5U3RhcnQgPT09IDB4ZmZmZmZmZmYgfHwKICAgICAgICAgICAgZGlyZWN0b3J5U3RhcnQgKyBkaXJlY3RvcnlTaXplID4gc2l6ZQogICAgICAgICkgewogICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RoZSBhcmNoaXZlIGlzIGEgemlwNjQgb25lLCBvciBzYXlzIGl0cyBkaXJlY3RvcnkgaXMgb3V0c2lkZSBpdCcpOwogICAgICAgIH0KICAgICAgICBjb25zdCBkaXJlY3RvcnkgPSByZWFkQXQoZmQsIGRpcmVjdG9yeVN0YXJ0LCBkaXJlY3RvcnlTaXplKTsKICAgICAgICBjb25zdCB3aGVyZSA9IGAke3RhcmdldH0vYDsKICAgICAgICBsZXQgY3Vyc29yID0gMDsKICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY291bnQ7IGluZGV4KyspIHsKICAgICAgICAgICAgaWYgKGRpcmVjdG9yeS5yZWFkVUludDMyTEUoY3Vyc29yKSAhPT0gQ0VOVFJBTF9GSUxFX0hFQURFUikgewogICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKAogICAgICAgICAgICAgICAgICAgICd0aGUgYXJjaGl2ZSBzYXlzIGl0IGhvbGRzIG1vcmUgZW50cmllcyB0aGFuIGl0cyBjZW50cmFsIGRpcmVjdG9yeSBkb2VzJywKICAgICAgICAgICAgICAgICk7CiAgICAgICAgICAgIH0KICAgICAgICAgICAgY29uc3QgZmxhZ3MgPSBkaXJlY3RvcnkucmVhZFVJbnQxNkxFKGN1cnNvciArIDgpOwogICAgICAgICAgICBjb25zdCBtZXRob2QgPSBkaXJlY3RvcnkucmVhZFVJbnQxNkxFKGN1cnNvciArIDEwKTsKICAgICAgICAgICAgY29uc3QgY29tcHJlc3NlZFNpemUgPSBkaXJlY3RvcnkucmVhZFVJbnQzMkxFKGN1cnNvciArIDIwKTsKICAgICAgICAgICAgY29uc3QgdW5jb21wcmVzc2VkU2l6ZSA9IGRpcmVjdG9yeS5yZWFkVUludDMyTEUoY3Vyc29yICsgMjQpOwogICAgICAgICAgICBjb25zdCBuYW1lTGVuZ3RoID0gZGlyZWN0b3J5LnJlYWRVSW50MTZMRShjdXJzb3IgKyAyOCk7CiAgICAgICAgICAgIGNvbnN0IGV4dHJhTGVuZ3RoID0gZGlyZWN0b3J5LnJlYWRVSW50MTZMRShjdXJzb3IgKyAzMCk7CiAgICAgICAgICAgIGNvbnN0IGNvbW1lbnRMZW5ndGggPSBkaXJlY3RvcnkucmVhZFVJbnQxNkxFKGN1cnNvciArIDMyKTsKICAgICAgICAgICAgY29uc3QgbG9jYWwgPSBkaXJlY3RvcnkucmVhZFVJbnQzMkxFKGN1cnNvciArIDQyKTsKICAgICAgICAgICAgY29uc3QgbmFtZSA9IGRpcmVjdG9yeS50b1N0cmluZygndXRmOCcsIGN1cnNvciArIDQ2LCBjdXJzb3IgKyA0NiArIG5hbWVMZW5ndGgpOwogICAgICAgICAgICBjdXJzb3IgKz0gNDYgKyBuYW1lTGVuZ3RoICsgZXh0cmFMZW5ndGggKyBjb21tZW50TGVuZ3RoOwogICAgICAgICAgICAvLyBBIGRpcmVjdG9yeSBlbnRyeTogdGhlIGZpbGVzIHRoYXQgbmVlZCBpdCBjcmVhdGUgaXQgb24gdGhlIHdheSBpbi4KICAgICAgICAgICAgaWYgKG5hbWUuZW5kc1dpdGgoJy8nKSkgY29udGludWU7CiAgICAgICAgICAgIGlmIChmbGFncyAmIDB4MSkKICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtuYW1lfSBpcyBlbmNyeXB0ZWQsIHdoaWNoIHRoaXMgcmVhZGVyIGRvZXMgbm90IHJlYWRgKTsKICAgICAgICAgICAgaWYgKAogICAgICAgICAgICAgICAgY29tcHJlc3NlZFNpemUgPT09IDB4ZmZmZmZmZmYgfHwKICAgICAgICAgICAgICAgIHVuY29tcHJlc3NlZFNpemUgPT09IDB4ZmZmZmZmZmYgfHwKICAgICAgICAgICAgICAgIGxvY2FsID09PSAweGZmZmZmZmZmCiAgICAgICAgICAgICkgewogICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke25hbWV9IGlzIGEgemlwNjQgZW50cnksIHdoaWNoIHRoaXMgcmVhZGVyIGRvZXMgbm90IHJlYWRgKTsKICAgICAgICAgICAgfQogICAgICAgICAgICBjb25zdCB3cml0dGVuID0gam9pbih0YXJnZXQsIG5hbWUpOwogICAgICAgICAgICBpZiAoIXdyaXR0ZW4uc3RhcnRzV2l0aCh3aGVyZSkpIHsKICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgJHtuYW1lfSB3b3VsZCBiZSB1bnBhY2tlZCBvdXRzaWRlICR7dGFyZ2V0fWApOwogICAgICAgICAgICB9CiAgICAgICAgICAgIGlmIChtZXRob2QgIT09IDAgJiYgbWV0aG9kICE9PSA4KSB7CiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoCiAgICAgICAgICAgICAgICAgICAgYCR7bmFtZX0gaXMgY29tcHJlc3NlZCB3aXRoIG1ldGhvZCAke21ldGhvZH0sIHdoaWNoIHRoaXMgcmVhZGVyIGRvZXMgbm90IHJlYWRgLAogICAgICAgICAgICAgICAgKTsKICAgICAgICAgICAgfQogICAgICAgICAgICBta2RpclN5bmMoam9pbih3cml0dGVuLCAnLi4nKSwge3JlY3Vyc2l2ZTogdHJ1ZX0pOwogICAgICAgICAgICBpZiAoY29tcHJlc3NlZFNpemUgPT09IDApIHsKICAgICAgICAgICAgICAgIHdyaXRlRmlsZVN5bmMod3JpdHRlbiwgJycpOwogICAgICAgICAgICAgICAgY29udGludWU7CiAgICAgICAgICAgIH0KICAgICAgICAgICAgLy8gVGhlIGxvY2FsIGhlYWRlciByZXBlYXRzIHRoZSBuYW1lIGFuZCBpdHMgZXh0cmEgZmllbGQsIGFuZCB0aGUgZGF0YSBmb2xsb3dzIHRoZW0uIEEgc3RyZWFtJ3MKICAgICAgICAgICAgLy8gcmFuZ2UgZW5kcyBvbiB0aGUgbGFzdCBieXRlIHJhdGhlciB0aGFuIG9uZSBwYXN0IGl0LgogICAgICAgICAgICBjb25zdCBoZWFkZXIgPSByZWFkQXQoZmQsIGxvY2FsLCAzMCk7CiAgICAgICAgICAgIGNvbnN0IGZyb20gPSBsb2NhbCArIDMwICsgaGVhZGVyLnJlYWRVSW50MTZMRSgyNikgKyBoZWFkZXIucmVhZFVJbnQxNkxFKDI4KTsKICAgICAgICAgICAgY29uc3QgcGFja2VkID0gY3JlYXRlUmVhZFN0cmVhbShhcmNoaXZlLCB7CiAgICAgICAgICAgICAgICBzdGFydDogZnJvbSwKICAgICAgICAgICAgICAgIGVuZDogZnJvbSArIGNvbXByZXNzZWRTaXplIC0gMSwKICAgICAgICAgICAgfSk7CiAgICAgICAgICAgIGlmIChtZXRob2QgPT09IDApIGF3YWl0IHBpcGVsaW5lKHBhY2tlZCwgY3JlYXRlV3JpdGVTdHJlYW0od3JpdHRlbikpOwogICAgICAgICAgICBlbHNlIGF3YWl0IHBpcGVsaW5lKHBhY2tlZCwgY3JlYXRlSW5mbGF0ZVJhdygpLCBjcmVhdGVXcml0ZVN0cmVhbSh3cml0dGVuKSk7CiAgICAgICAgfQogICAgfSBmaW5hbGx5IHsKICAgICAgICBjbG9zZVN5bmMoZmQpOwogICAgfQp9OwoKLyoqCiAqIFJ1biBSdXNoJ3MgbGluayBzY3JpcHQgb3ZlciB0aGUgdHJlZSB0aGF0IGlzIGF0IGB0YXJnZXRgIG5vdywgaWYgaXQgY2FycmllcyBvbmUuCiAqCiAqIFRoZSBzY3JpcHQgcmVwbGFjZXMgdGhlIGBub2RlX21vZHVsZXNgIGEgZGVwbG95IGNvdWxkIG5vdCBhcmNoaXZlOiBhIHRhciBvciBhIHppcCBjYW5ub3QgaG9sZCBzeW1saW5rcywKICogc28gYHJ1c2ggZGVwbG95YCB3cml0ZXMgdGhlIGxpbmtzIGFzIGEgc2NyaXB0IGFuZCBzb21ldGhpbmcgaGFzIHRvIHJ1biBpdCB3aGVyZSB0aGUgYXJ0aWZhY3QgbGFuZHMuCiAqIGBwcm9jZXNzLmV4ZWNQYXRoYCByYXRoZXIgdGhhbiBgbm9kZWAsIGJlY2F1c2UgdGhlIHJ1bnRpbWUgdGhhdCBzdGFydGVkIHRoaXMgcHJvZ3JhbSBpcyBjZXJ0YWlubHkKICogdGhlcmUgYW5kIG9uZSBvbiBgUEFUSGAgbWF5IG5vdCBiZS4KICovCmV4cG9ydCBjb25zdCBsaW5rQXQgPSAodGFyZ2V0OiBzdHJpbmcpOiB2b2lkID0+IHsKICAgIGlmICghZXhpc3RzU3luYyhqb2luKHRhcmdldCwgTElOS19TQ1JJUFQpKSkgcmV0dXJuOwogICAgZXhlY0ZpbGVTeW5jKHByb2Nlc3MuZXhlY1BhdGgsIFtMSU5LX1NDUklQVCwgJ2NyZWF0ZSddLCB7Y3dkOiB0YXJnZXQsIHN0ZGlvOiAnaW5oZXJpdCd9KTsKfTsKCi8qKgogKiBSZXdyaXRlIGV2ZXJ5IGFic29sdXRlIGxpbmsgdW5kZXIgYHRhcmdldGAgYXMgYSByZWxhdGl2ZSBvbmUuCiAqCiAqIFRoZSBsaW5rIHNjcmlwdCBjb21wdXRlcyBpdHMgdGFyZ2V0cyBmcm9tIHRoZSBkaXJlY3RvcnkgaXQgcnVucyBpbiwgc28gYSB0cmVlIGxpbmtlZCBhdAogKiBgL3Zhci9saWIvYmxvbmcvc3VpdGVzLzxzdWl0ZT4vPGlkZW50aXR5PmAgY2FycmllcyBsaW5rcyBuYW1pbmcgdGhhdCBwYXRoIOKAlCBhbmQgYSByZWFkZXIgdGhhdCBtb3VudHMgdGhlCiAqIGRpcmVjdG9yeSBhbnl3aGVyZSBlbHNlIGhhcyBodW5kcmVkcyBvZiBkYW5nbGluZyBsaW5rcyBhbmQgZGllcyBvbiBpdHMgZmlyc3QgaW1wb3J0IChGLTQ0OSkuIEV2ZXJ5CiAqIGxpbmsncyB0YXJnZXQgaXMgaW5zaWRlIHRoZSBhcnRpZmFjdCwgd2hpY2ggd2FzIGNoZWNrZWQgYWNyb3NzIGEgd2hvbGUgdHJlZSBpbiBhIGxpdmUgY2x1c3Rlciwgc28gYQogKiByZWxhdGl2ZSBsaW5rIGlzIGVxdWl2YWxlbnQgYW5kIHBvc2l0aW9uLWluZGVwZW5kZW50LgogKgogKiBBIHN5bWxpbmtlZCBkaXJlY3RvcnkgaXMgbm90IGRlc2NlbmRlZCBpbnRvIOKAlCBgcmVhZGRpcmAgcmVwb3J0cyBpdCBhcyBhIGxpbmssIG5vdCBhcyBhIGRpcmVjdG9yeSDigJQKICogd2hpY2ggbWF0dGVycyBiZWNhdXNlIGEgbGluayBwb2ludGluZyBpbnRvIGEgYG5vZGVfbW9kdWxlc2AgdHJlZSB3b3VsZCBvdGhlcndpc2UgYmUgd2Fsa2VkIGEgc2Vjb25kCiAqIHRpbWUuCiAqLwpleHBvcnQgY29uc3QgcmVsYXRpdml6ZUxpbmtzID0gKHRhcmdldDogc3RyaW5nKTogbnVtYmVyID0+IHsKICAgIGxldCByZXdyaXR0ZW4gPSAwOwogICAgY29uc3Qgd2FsayA9IChkaXJlY3Rvcnk6IHN0cmluZyk6IHZvaWQgPT4gewogICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgcmVhZGRpclN5bmMoZGlyZWN0b3J5LCB7d2l0aEZpbGVUeXBlczogdHJ1ZX0pKSB7CiAgICAgICAgICAgIGNvbnN0IHBhdGggPSBqb2luKGRpcmVjdG9yeSwgZW50cnkubmFtZSk7CiAgICAgICAgICAgIGlmIChlbnRyeS5pc1N5bWJvbGljTGluaygpKSB7CiAgICAgICAgICAgICAgICBjb25zdCBwb2ludHNBdCA9IHJlYWRsaW5rU3luYyhwYXRoKTsKICAgICAgICAgICAgICAgIGlmIChpc0Fic29sdXRlKHBvaW50c0F0KSkgewogICAgICAgICAgICAgICAgICAgIHVubGlua1N5bmMocGF0aCk7CiAgICAgICAgICAgICAgICAgICAgc3ltbGlua1N5bmMocmVsYXRpdmUoZGlyZWN0b3J5LCBwb2ludHNBdCksIHBhdGgpOwogICAgICAgICAgICAgICAgICAgIHJld3JpdHRlbisrOwogICAgICAgICAgICAgICAgfQogICAgICAgICAgICB9IGVsc2UgaWYgKGVudHJ5LmlzRGlyZWN0b3J5KCkpIHdhbGsocGF0aCk7CiAgICAgICAgfQogICAgfTsKICAgIHdhbGsodGFyZ2V0KTsKICAgIHJldHVybiByZXdyaXR0ZW47Cn07CgovKioKICogQ29weSBhIGRpcmVjdG9yeSdzIGNvbnRlbnRzIGludG8gYW5vdGhlciwgd2hpY2ggaXMgd2hhdCBhIGBwYXRoYCBhcnRpZmFjdCBpcy4KICoKICogRW50cnkgYnkgZW50cnkgcmF0aGVyIHRoYW4gaW4gb25lIGNhbGwsIGJlY2F1c2UgdGhlIGFydGlmYWN0J3MgKmNvbnRlbnRzKiBhcmUgd2FudGVkIGF0IHRoZSB0YXJnZXQgYW5kCiAqIG5vdCB0aGUgYXJ0aWZhY3QgZGlyZWN0b3J5IGl0c2VsZjogYGNwIC1SIOKApi8uIOKApi9gIHdhcyB0aGUgc2hlbGwncyBzcGVsbGluZyBvZiB0aGUgc2FtZSB0aGluZy4KICovCmV4cG9ydCBjb25zdCBjb3B5VHJlZSA9IChzb3VyY2U6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiB2b2lkID0+IHsKICAgIGZvciAoY29uc3QgZW50cnkgb2YgcmVhZGRpclN5bmMoc291cmNlKSkgewogICAgICAgIGNvbnN0IGZyb20gPSBqb2luKHNvdXJjZSwgZW50cnkpOwogICAgICAgIGNvbnN0IHRvID0gam9pbih0YXJnZXQsIGVudHJ5KTsKICAgICAgICBpZiAoc3RhdFN5bmMoZnJvbSkuaXNEaXJlY3RvcnkoKSkgewogICAgICAgICAgICBta2RpclN5bmModG8sIHtyZWN1cnNpdmU6IHRydWV9KTsKICAgICAgICAgICAgY29weVRyZWUoZnJvbSwgdG8pOwogICAgICAgIH0gZWxzZSB7CiAgICAgICAgICAgIGNvcHlGaWxlU3luYyhmcm9tLCB0byk7CiAgICAgICAgfQogICAgfQp9OwoKLyoqCiAqIERvd25sb2FkIGEgVVJMIHRvIGEgZmlsZS4KICoKICogYGZldGNoYCByYXRoZXIgdGhhbiBhIHJlcXVlc3QgbGlicmFyeTogaXQgaXMgaW4gdGhlIHJ1bnRpbWUsIGFuZCBhIG1vdW50ZWQgY29weSBvZiB0aGlzIG1vZHVsZSBjb3VsZAogKiByZXNvbHZlIG5vdGhpbmcgZWxzZS4gU3RyZWFtZWQgcmF0aGVyIHRoYW4gYnVmZmVyZWQsIGJlY2F1c2UgYSBzdWl0ZSBhcnRpZmFjdCBpcyBodW5kcmVkcyBvZiBtZWdhYnl0ZXMKICogYW5kIHRoZSBmaWxsIHJ1bnMgb24gYSBub2RlIHRoYXQgaGFzIG9uZSBkaXJlY3RvcnkncyB3b3J0aCBvZiByb29tIHRvIHNwYXJlLCBub3QgdHdvLgogKi8KZXhwb3J0IGNvbnN0IGRvd25sb2FkID0gYXN5bmMgKHVybDogc3RyaW5nLCB0bzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiA9PiB7CiAgICBjb25zdCBhbnN3ZXIgPSBhd2FpdCBmZXRjaCh1cmwpOwogICAgaWYgKCFhbnN3ZXIub2sgfHwgIWFuc3dlci5ib2R5KSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGB0aGUgYXJ0aWZhY3QgYXQgJHt1cmx9IGFuc3dlcmVkICR7YW5zd2VyLnN0YXR1c30gJHthbnN3ZXIuc3RhdHVzVGV4dH1gKTsKICAgIH0KICAgIC8vIFRoZSBib2R5IGlzIGFuIGFzeW5jIGl0ZXJhdG9yIGF0IHJ1bnRpbWU7IHRoZSB0eXBlIG9ubHkgY2FycmllcyB0aGF0IHRocm91Z2ggYG5vZGU6c3RyZWFtL3dlYmAsCiAgICAvLyB3aGljaCBpcyBhIGNhc3QgdGhpcyBmaWxlIHdvdWxkIHJhdGhlciBub3QgZGVwZW5kIG9uLgogICAgY29uc3QgYm9keSA9IGFuc3dlci5ib2R5IGFzIHVua25vd24gYXMgQXN5bmNJdGVyYWJsZTxVaW50OEFycmF5PjsKICAgIGF3YWl0IHBpcGVsaW5lKFJlYWRhYmxlLmZyb20oYm9keSksIGNyZWF0ZVdyaXRlU3RyZWFtKHRvKSk7Cn07CgovKioKICogUGxhY2UgYW4gYXJ0aWZhY3QgaW4gdGhlIGRpcmVjdG9yeSBpdCB3aWxsIGJlIHJlYWQgZnJvbS4KICoKICogVGhlIG1hcmtlciBjb21lcyBvZmYgZmlyc3QgYW5kIGdvZXMgb24gbGFzdDogaXQgaXMgd2hhdCBzYXlzIHRoZSBhcnRpZmFjdCBpcyB3aG9sZS4gQSBkaXJlY3RvcnkgaXMKICogcmVwbGFjZWQgcmF0aGVyIHRoYW4gbWVyZ2VkLCB3aGljaGV2ZXIgd2F5IHRoZSBhcnRpZmFjdCBhcnJpdmVzLCBzbyBhIHJlcnVuIGNhbm5vdCBrZWVwIGFuIG9sZGVyIGZpbGUKICogb3IgbGVhdmUgdGhlIGxpbmsgc2NyaXB0IGxvb2tpbmcgYXQgbGlua3MgaXQgd2lsbCBub3QgY3JlYXRlIGFnYWluIOKAlCB3aGljaCBpcyB3aHkgdGhlIHRhcmdldCBpcyBlbXB0aWVkCiAqIHJhdGhlciB0aGFuIHdyaXR0ZW4gaW50by4KICovCmV4cG9ydCBjb25zdCBmaWxsQXJ0aWZhY3QgPSBhc3luYyAocmVxdWVzdDogSUZpbGxSZXF1ZXN0KTogUHJvbWlzZTx2b2lkPiA9PiB7CiAgICBjb25zdCB7c291cmNlLCB0YXJnZXR9ID0gcmVxdWVzdDsKICAgIHJtU3luYyhqb2luKHRhcmdldCwgQVJUSUZBQ1RfUkVBRFkpLCB7Zm9yY2U6IHRydWV9KTsKICAgIHJtU3luYyh0YXJnZXQsIHtyZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlfSk7CiAgICBta2RpclN5bmModGFyZ2V0LCB7cmVjdXJzaXZlOiB0cnVlfSk7CiAgICBpZiAoc291cmNlLnBhdGgpIHsKICAgICAgICBjb3B5VHJlZShzb3VyY2UucGF0aCwgdGFyZ2V0KTsKICAgIH0gZWxzZSBpZiAoc291cmNlLnVybCkgewogICAgICAgIGNvbnN0IGFyY2hpdmUgPSBqb2luKHRtcGRpcigpLCBgYmxvbmctYXJ0aWZhY3QtJHtwcm9jZXNzLnBpZH0uemlwYCk7CiAgICAgICAgdHJ5IHsKICAgICAgICAgICAgYXdhaXQgZG93bmxvYWQoc291cmNlLnVybCwgYXJjaGl2ZSk7CiAgICAgICAgICAgIGF3YWl0IHVucGFja1ppcChhcmNoaXZlLCB0YXJnZXQpOwogICAgICAgIH0gZmluYWxseSB7CiAgICAgICAgICAgIHJtU3luYyhhcmNoaXZlLCB7Zm9yY2U6IHRydWV9KTsKICAgICAgICB9CiAgICB9IGVsc2UgewogICAgICAgIHRocm93IG5ldyBFcnJvcigndGhlIGFydGlmYWN0IG5hbWVzIG5laXRoZXIgYSB1cmwgdG8gZmV0Y2ggbm9yIGEgcGF0aCB0byByZWFkJyk7CiAgICB9CiAgICBsaW5rQXQodGFyZ2V0KTsKICAgIHJlbGF0aXZpemVMaW5rcyh0YXJnZXQpOwogICAgd3JpdGVGaWxlU3luYyhqb2luKHRhcmdldCwgQVJUSUZBQ1RfUkVBRFkpLCAnJyk7CiAgICBpZiAocmVxdWVzdC5rZWVwICE9PSB1bmRlZmluZWQpIGtlZXBOZXdlc3QoZGlybmFtZSh0YXJnZXQpLCByZXF1ZXN0LmtlZXApOwp9OwoKLyoqCiAqIEtlZXAgdGhlIG5ld2VzdCBkaXJlY3RvcmllcyB1bmRlciBgcm9vdGAsIGFuZCBkZWxldGUgdGhlIHJlc3QuCiAqCiAqIEJ5IG1vZGlmaWNhdGlvbiB0aW1lIHJhdGhlciB0aGFuIGJ5IG5hbWU6IGFuIGlkZW50aXR5IGlzIGEgZGlnZXN0IG9yIGEgc3RhbXAsIGFuZCBuZWl0aGVyIG9yZGVycyDigJQgInRoZQogKiBsYXN0IHRocmVlIiBpcyBhIHF1ZXN0aW9uIHRoZSBub2RlIGNhbiBhbnN3ZXIgb24gaXRzIG93bi4gVGhlIGNhbGxlciBwYXNzZXMgdGhlIGNvdW50IGl0IHdhbnRzIHRvIGVuZCB1cAogKiB3aXRoLCBhbmQgdGhlIGRpcmVjdG9yeSBqdXN0IHdyaXR0ZW4gaXMgYW1vbmcgdGhlbSwgYmVjYXVzZSBhIGZpbGwgaGFzIG9ubHkgcmVuYW1lZCBpdCBpbnRvIHBsYWNlLgogKi8KZXhwb3J0IGNvbnN0IGtlZXBOZXdlc3QgPSAocm9vdDogc3RyaW5nLCBrZWVwOiBudW1iZXIpOiB2b2lkID0+IHsKICAgIGNvbnN0IGRpcmVjdG9yaWVzID0gcmVhZGRpclN5bmMocm9vdCwge3dpdGhGaWxlVHlwZXM6IHRydWV9KQogICAgICAgIC5maWx0ZXIoZW50cnkgPT4gZW50cnkuaXNEaXJlY3RvcnkoKSkKICAgICAgICAubWFwKGVudHJ5ID0+ICh7bmFtZTogZW50cnkubmFtZSwgYXQ6IHN0YXRTeW5jKGpvaW4ocm9vdCwgZW50cnkubmFtZSkpLm10aW1lTXN9KSkKICAgICAgICAuc29ydCgobGVmdCwgcmlnaHQpID0+IHJpZ2h0LmF0IC0gbGVmdC5hdCk7CiAgICBmb3IgKGNvbnN0IHtuYW1lfSBvZiBkaXJlY3Rvcmllcy5zbGljZShrZWVwKSkgewogICAgICAgIHJtU3luYyhqb2luKHJvb3QsIG5hbWUpLCB7cmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZX0pOwogICAgfQp9OwoKLyoqIFN0YWdpbmcgZGlyZWN0b3JpZXMgYW4gaW50ZXJydXB0ZWQgZmlsbCBsZWZ0IGJlaGluZCwgd2hpY2ggbm90aGluZyBlbHNlIHdvdWxkIGV2ZXIgY29sbGVjdC4gKi8KZXhwb3J0IGNvbnN0IGRyb3BTdGFsZVN0YWdpbmcgPSAocm9vdDogc3RyaW5nLCBvbGRlclRoYW5NcyA9IDYwICogNjAgKiAxMDAwKTogdm9pZCA9PiB7CiAgICBjb25zdCBub3cgPSBEYXRlLm5vdygpOwogICAgZm9yIChjb25zdCBlbnRyeSBvZiByZWFkZGlyU3luYyhyb290LCB7d2l0aEZpbGVUeXBlczogdHJ1ZX0pKSB7CiAgICAgICAgaWYgKCFlbnRyeS5pc0RpcmVjdG9yeSgpIHx8ICFlbnRyeS5uYW1lLnN0YXJ0c1dpdGgoJy5zdGFnaW5nLScpKSBjb250aW51ZTsKICAgICAgICBpZiAobm93IC0gc3RhdFN5bmMoam9pbihyb290LCBlbnRyeS5uYW1lKSkubXRpbWVNcyA8IG9sZGVyVGhhbk1zKSBjb250aW51ZTsKICAgICAgICBybVN5bmMoam9pbihyb290LCBlbnRyeS5uYW1lKSwge3JlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWV9KTsKICAgIH0KfTsKCi8qKgogKiBUaGUgZmlsbCBhIG5vZGUgcnVucywgZHJpdmVuIGJ5IHRoZSBlbnZpcm9ubWVudCB0aGUgSm9iIHNldHMuCiAqCiAqIEEgKnN0YWdlZCogZmlsbDogdGhlIGFydGlmYWN0IGlzIHVucGFja2VkLCBsaW5rZWQgYW5kIG1hZGUgcG9ydGFibGUgYmVzaWRlIHdoZXJlIGl0IGJlbG9uZ3MsIGFuZCB0aGVuCiAqIG1vdmVkIGludG8gcGxhY2UgaW4gb25lIHJlbmFtZSwgc28gYSByZWFkZXIgc2VlcyBlaXRoZXIgbm90aGluZyBvciBhIHdob2xlIHRyZWUg4oCUIHdoaWNoIGlzIHdoYXQgbWFrZXMgYW4KICogaW4tcGxhY2UgcmV3cml0ZSwgYW5kIHRoZSBub3RpZmljYXRpb24gYSByZWFkZXIgd291bGQgbmVlZCB0byBzdXJ2aXZlIG9uZSwgdW5uZWNlc3NhcnkgKEQtNDY4KS4gTGlua2luZwogKiBiZWZvcmUgdGhlIG1vdmUgaXMgd2hhdCB0aGUgcmVsYXRpdmUgbGlua3MgbWFrZSBwb3NzaWJsZTogYSByZWxhdGl2ZSBsaW5rIG5hbWVzIGEgcGF0aCAqd2l0aGluKiB0aGUKICogdHJlZSwgc28gYSByZW5hbWUgdGhhdCBwcmVzZXJ2ZXMgdGhlIHRyZWUncyBzaGFwZSBrZWVwcyBldmVyeSBsaW5rIHZhbGlkLgogKgogKiBBIGRpcmVjdG9yeSB0aGF0IGFscmVhZHkgaG9sZHMgYSB3aG9sZSBhcnRpZmFjdCBpcyB3aGF0IHRoaXMgZXhpc3RzIHRvIGFycml2ZSBhdCwgc28gaXQgcmV0dXJucyB3aXRob3V0CiAqIHRvdWNoaW5nIGl0OiB0aGUgaWRlbnRpdHkgKmlzKiB0aGUgY29udGVudCAoRC00NjkpLgogKi8KZXhwb3J0IGNvbnN0IGZpbGxGcm9tRW52aXJvbm1lbnQgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7CiAgICBjb25zdCBlbnYgPSBwcm9jZXNzLmVudjsKICAgIGNvbnN0IHJvb3QgPSBlbnZbRklMTF9FTlYucm9vdF07CiAgICBjb25zdCBpZGVudGl0eSA9IGVudltGSUxMX0VOVi5pZGVudGl0eV07CiAgICBjb25zdCBrZWVwID0gZW52W0ZJTExfRU5WLmtlZXBdOwogICAgLy8gUmVmdXNlZCByYXRoZXIgdGhhbiBkZWZhdWx0ZWQ6IGEgSm9iIHRoYXQgZm9yZ290IG9uZSBvZiB0aGVzZSB3b3VsZCB1bnBhY2sgYW4gYXJ0aWZhY3QgaW50byB0aGUKICAgIC8vIHdyb25nIHBsYWNlLCBvciBrZWVwIGV2ZXJ5IGRpcmVjdG9yeSBvbiB0aGUgbm9kZSBmb3IgZXZlci4gVGhlIHNoZWxsIHNhaWQgdGhlIHNhbWUgd2l0aCBgOiAiJHt4Oj99ImAuCiAgICBpZiAoIXJvb3QgfHwgIWlkZW50aXR5IHx8ICFrZWVwKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKAogICAgICAgICAgICBgJHtGSUxMX0VOVi5yb290fSwgJHtGSUxMX0VOVi5pZGVudGl0eX0gYW5kICR7RklMTF9FTlYua2VlcH0gYXJlIGFsbCByZXF1aXJlZGAsCiAgICAgICAgKTsKICAgIH0KICAgIGNvbnN0IHRhcmdldCA9IGpvaW4ocm9vdCwgaWRlbnRpdHkpOwogICAgaWYgKGV4aXN0c1N5bmMoam9pbih0YXJnZXQsIEFSVElGQUNUX1JFQURZKSkpIHJldHVybjsKICAgIGNvbnN0IHN0YWdpbmcgPSBqb2luKHJvb3QsIGAuc3RhZ2luZy0ke2lkZW50aXR5fWApOwogICAgcm1TeW5jKHN0YWdpbmcsIHtyZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlfSk7CiAgICBta2RpclN5bmMoc3RhZ2luZywge3JlY3Vyc2l2ZTogdHJ1ZX0pOwogICAgLy8gVGhlIHJldGVudGlvbiBpcyBob3cgbWFueSBpZGVudGl0aWVzIHN0YXkgb24gdGhlIG5vZGUsIGFuZCB0aGlzIHJ1bidzIGRpcmVjdG9yeSBpcyBvbmUgb2YgdGhlbTogdGhlCiAgICAvLyBzaGVsbCBzcGVsbGluZyBwYXNzZWQgb25lIG1vcmUgdG8gYSBoZWxwZXIgdGhhdCBrZXB0IG9uZSBmZXdlciwgd2hpY2ggaXMgdGhlIHNhbWUgbnVtYmVyIHdyaXR0ZW4KICAgIC8vIHR3aWNlIChELTQ3MCkuCiAgICBhd2FpdCBmaWxsQXJ0aWZhY3QoewogICAgICAgIHNvdXJjZTogZW52W0ZJTExfRU5WLnBhdGhdID8ge3BhdGg6IGVudltGSUxMX0VOVi5wYXRoXX0gOiB7dXJsOiBlbnZbRklMTF9FTlYudXJsXSA/PyAnJ30sCiAgICAgICAgdGFyZ2V0OiBzdGFnaW5nLAogICAgICAgIGtlZXA6IE51bWJlcihrZWVwKSwKICAgIH0pOwogICAgLy8gT25seSBldmVyIGFuICppbmNvbXBsZXRlKiBkaXJlY3Rvcnk6IGEgd2hvbGUgb25lIHJldHVybmVkIGFib3ZlLCBzbyB0aGlzIGlzIHdoYXQgYW4gaW50ZXJydXB0ZWQgbW92ZQogICAgLy8gb3IgYSB0cmVlIGZyb20gYW4gZWFybGllciByZXZpc2lvbiBsZWF2ZXMgYmVoaW5kLgogICAgcm1TeW5jKHRhcmdldCwge3JlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWV9KTsKICAgIHJlbmFtZVN5bmMoc3RhZ2luZywgdGFyZ2V0KTsKICAgIGRyb3BTdGFsZVN0YWdpbmcocm9vdCk7Cn07CgovKioKICogVGhlIHByb2dyYW0gaGFsZjogYSBmaWxsIEpvYiBzdGFydHMgdGhpcyBmaWxlIHdpdGggYG5vZGVgLCBhbmQgbm90aGluZyBlbHNlIGRvZXMuCiAqCiAqIE1hdGNoZWQgYnkgKnJlYWxwYXRoKiByYXRoZXIgdGhhbiBieSBjb21wYXJpbmcgVVJMcywgYmVjYXVzZSB0aGUgY29weSBhIEpvYiBydW5zIGlzIG1vdW50ZWQgZnJvbSBhCiAqIENvbmZpZ01hcCBhbmQgdGhlIGt1YmVsZXQgcHVibGlzaGVzIGEgbW91bnQgYXMgYSBzeW1saW5rIHRvIGEgdmVyc2lvbmVkIGRpcmVjdG9yeTogYG5vZGUgL3NjcmlwdC9maWxsLm10c2AKICogcmVzb2x2ZXMgdG8gYC4uLi8uLjIwMjZfMTBfMTFfMTRfNDZfNTUuMTIzLyBmaWxsLm10c2AsIHNvIGBpbXBvcnQubWV0YS51cmxgIG5hbWVzIHRoYXQgd2hpbGUKICogYHByb2Nlc3MuYXJndlsxXWAgbmFtZXMgdGhlIHBhdGggdGhlIEpvYiB0eXBlZC4gQ29tcGFyaW5nIHRoZSB0d28gdmVyYmF0aW0gdGhlcmVmb3JlIG5ldmVyIG1hdGNoZWQsIGFuZAogKiB0aGUgbW9kdWxlIGRpZCBub3RoaW5nIGF0IGFsbCDigJQgdGhlIGZpbGwgSm9iIHJlcG9ydGVkIGBDb21wbGV0ZWRgIHNlY29uZHMgYWZ0ZXIgaXQgc3RhcnRlZCBhbmQgcHVibGlzaGVkCiAqIG5vdGhpbmcsIGxlYXZpbmcgZXZlcnkgcmVhZGVyIFBlbmRpbmcgb24gYSBkaXJlY3RvcnkgdGhhdCB3YXMgbmV2ZXIgY3JlYXRlZCAoZm91bmQgaW4gdGhlIGRldiBjbHVzdGVyKS4KICogVGhlIHJlYWxwYXRoIGNvbXBhcmlzb24gcnVucyB0aGUgZmlsbCBpbiBib3RoIHRoZSBtb3VudGVkIGFuZCB0aGUgcGxhaW4gY2FzZSwgYW5kIHN0aWxsIHJlZnVzZXMgd2hlbiB0aGUKICogbW9kdWxlIGlzICppbXBvcnRlZCo6IHRoZSBlbnRyeSBwb2ludCBpcyB0aGVuIHRoZSBvcGVyYXRvcidzIG93bi4KICovCmNvbnN0IHN0YXJ0ZWRBc0FQcm9ncmFtID0gKCk6IGJvb2xlYW4gPT4gewogICAgY29uc3QgZW50cnkgPSBwcm9jZXNzLmFyZ3ZbMV07CiAgICBpZiAoIWVudHJ5KSByZXR1cm4gZmFsc2U7CiAgICB0cnkgewogICAgICAgIHJldHVybiByZWFscGF0aFN5bmMoZW50cnkpID09PSBmaWxlVVJMVG9QYXRoKGltcG9ydC5tZXRhLnVybCk7CiAgICB9IGNhdGNoIHsKICAgICAgICAvLyBBIHBhdGggdGhhdCBjYW5ub3QgYmUgcmVzb2x2ZWQgaXMgbm90IHRoaXMgbW9kdWxlOiBhIGNhbGxlciB0aGF0IHN0YXJ0ZWQgc29tZXRoaW5nIGVsc2UuCiAgICAgICAgcmV0dXJuIGZhbHNlOwogICAgfQp9OwoKaWYgKHN0YXJ0ZWRBc0FQcm9ncmFtKCkpIHsKICAgIGF3YWl0IGZpbGxGcm9tRW52aXJvbm1lbnQoKTsKfQo=
    kind: ConfigMap
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 784ee8056af8edbb
      name: fill-script
      namespace: blong-suite
    
  ),
  "configmaps/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - fill-script.yaml
    
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
        blong.feasible.one/spec-hash: 99e2f789992e7ee4
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
            blong.feasible.one/namespace-identity: "true"
            blong.feasible.one/namespace-kustomize: "true"
            blong.feasible.one/namespace-login: "true"
            blong.feasible.one/namespace-session: "true"
        spec:
          containers:
            - args:
                - /opt/deploy/suite/index.ts
                - release
                - --kustomize.orchestrator
                - --kustomize.gateway
                - --srv.orchestrator
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
    resources:
      - cache
      - configmaps
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
  "services/identity.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 1a84b68d6226e1a7
      name: identity
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
  "services/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - identity.yaml
      - kustomize.yaml
      - login.yaml
      - session.yaml
    
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
  "services/session.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: f19d81935adbc250
      name: session
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
    "configmaps/fill-script.yaml",
    "configmaps/kustomization.yaml",
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
    "configmaps/fill-script.yaml",
    "configmaps/kustomization.yaml",
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
