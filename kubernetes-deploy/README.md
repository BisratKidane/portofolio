# kubernetes-deploy — deploy to a Kubernetes cluster

> This repo has **two** deploy paths. This one runs the app as pods on a cluster.
> For a single Docker host (the Hetzner box), see [`../docker-deploy`](../docker-deploy).

Same Docker Hub images as `../docker-deploy`. An Ingress terminates TLS and routes
`/graphql` → backend, `/*` → the static frontend.

```
Ingress (TLS) ─ /graphql ─► Service backend  ─► backend pod
              └ /*       ─► Service frontend ─► frontend pods
                                     Service mysql ─► mysql pod ─► PVC
```

---

## Run the deploy

### First time

1. **Prereqs**
   - A cluster + a `kubectl` context pointing at it.
   - An **ingress controller** (manifests assume `ingressClassName: nginx`) and
     **cert-manager** with a `ClusterIssuer` named `letsencrypt-prod`
     (edit `ingress.yaml` if yours differ).
   - A default `StorageClass` that can satisfy a `ReadWriteOnce` PVC.
   - Images on Docker Hub — either build them with
     `../docker-deploy/build-and-push.sh`, or use `./deploy.sh --build` (step 4).

2. **Secrets** (gitignored):
   ```bash
   cd kubernetes-deploy
   cp secret.example.env secret.env         # fill in real values, no CHANGE_ME left
   ```

3. **Edit the manifests** — replace `app.example.com` / `your-dockerhub-username`:
   - `configmap.yaml` → `CLIENT_URL`, `CLIENT_ORIGINS`, `SMTP_*`
   - `ingress.yaml` → `host` (2×) and `tls.hosts`
   - `kustomization.yaml` → `images[].newName` (your Docker Hub user), `newTag`

4. **Deploy** to the current context (it prints the context and asks to confirm):
   ```bash
   ./deploy.sh            # images already pushed
   # or
   ./deploy.sh --build    # build+push from main first, auto-pin the sha tag, then apply
   ```
   It creates the `portofolio-secret` from `secret.env`, applies everything with
   kustomize, and waits for the rollouts.

5. **Point DNS** at the Ingress address (`kubectl -n portofolio get ingress`);
   cert-manager issues the TLS cert. First user to verify their email becomes `ADMIN`.

### Every time after

```bash
cd kubernetes-deploy
./deploy.sh              # re-apply (uses whatever image tag is pinned in kustomization.yaml)
./deploy.sh --build      # rebuild from main, push, pin new sha tag, re-apply
```

`--build` always builds the app from the **`main`** branch via
`../docker-deploy/build-and-push.sh`.

---

## What each file does

| File | Purpose |
|------|---------|
| `deploy.sh` | Creates the Secret and applies everything to the current context. `--build` to build+push first. |
| `namespace.yaml` | `portofolio` namespace. |
| `configmap.yaml` | Non-secret config (URLs, DB wiring, SMTP host). |
| `secret.example.env` | Copy → `secret.env` (gitignored): JWT + DB + SMTP secrets. |
| `mysql.yaml` | PVC + Deployment (Recreate) + Service. |
| `backend.yaml` | Deployment (1 replica) + Service, `/health` probes. |
| `frontend.yaml` | Deployment (static nginx SPA) + Service. |
| `ingress.yaml` | Host routing + TLS. |
| `kustomization.yaml` | Ties resources together and pins the images. |

## Inspect / operate

```bash
kubectl -n portofolio get pods
kubectl -n portofolio logs -f deploy/backend
kubectl -n portofolio get ingress portofolio
kubectl delete -k .        # tear down (Secret + PVC remain)
```

## Notes

- **Secret stays out of git** — created imperatively from `secret.env`, upserted each run.
- **Backend pinned to 1 replica** — the rate limiter is in-memory per process.
- **DB schema** is auto-created on first boot (`sequelize.sync()`) — no migration job needed for a fresh DB.
