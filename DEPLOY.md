# Deploying Server Monitor to TrueNAS SCALE

## 1. Repository Structure

Push the **entire** project folder (containing `backend/`, `frontend/`, and `docker-compose.yml`) to your Git repository (e.g., GitHub).
Do not push them as separate repositories. The `docker-compose.yml` expects them to be side-by-side.

**Repository compatibility**:

```
repo-root/
├── backend/
│   ├── Dockerfile
│   └── ...
├── frontend/
│   ├── Dockerfile
│   └── ...
└── docker-compose.yml
```

## 2. Server Setup (TrueNAS)

On your TrueNAS server, create a directory for the application:

```bash
# Example
mkdir -p /mnt/collab-services/server-monitor
cd /mnt/collab-services/server-monitor
```

## 3. Deployment Options

### Option A: The "Git Pull + Build on Server" Method (Recommended)

This gives you the most control since you want to build it locally on the server.

1.  **Clone/Pull the code**:

    ```bash
    cd /mnt/collab-services/server-monitor
    git clone https://github.com/your-username/your-repo.git .
    # OR if already cloned:
    git pull
    ```

2.  **Deploy with Portainer (Stack from File)**:
    Since the code is now on the server, you can point Portainer to it.
    - Go to **Portainer** -> **Stacks** -> **Add Stack**.
    - Name: `server-monitor`
    - Select **Build Method**: `Repository` (if you want Portainer to pull) OR ignore this and just run it manually below.
    - **Better Way (since you are on the CLI)**:
      Just run this command in the directory:
      `bash
docker-compose up -d --build
`
      Portainer will automatically detect the running containers (`server-monitor-backend` and `server-monitor-frontend`) and let you manage them (logs, restart, etc.) even if you didn't create the stack inside the Portainer UI.

### Option B: Portainer "Stack from Repository"

If you prefer to do everything inside Portainer's UI:

1.  Go to **Stacks** -> **Add Stack**.
2.  Select **Repository**.
3.  Repository URL: `https://github.com/your-username/your-repo.git`
4.  Compose path: `docker-compose.yml`
5.  Click **Deploy the stack**.
    - _Note_: Portainer will clone the repo and build the images for you. This is the cleanest UI-only method.

## 4. Answering Your Questions

**Q1: Do I push backend and frontend separately?**
**No.** Push them together in one repo. The `docker-compose.yml` at the root links them together.

**Q2: In the server to deploy it using portainer we will need a stack file?**
**Yes.** Your `docker-compose.yml` **is** the stack file. It contains the build instructions (`./backend`, `./frontend`), ports (`8082`), and volume mounts (`/proc`, etc.).

**Q3: Where do I pull the maintenance module?**
Create a new dedicated folder: `/mnt/collab-services/server-monitor` (or `maintenance-module`). Keep it separate from your other services but in the same parent directory (`/mnt/collab-services`).

**Q4: Do we tell in the stack file what needs to be built and how?**
**Yes.** The `build: ./backend` and `build: ./frontend` lines in `docker-compose.yml` are the instructions. Portainer (or `docker-compose up`) follows these to build the images from the source code.
