# Website Release Notification Workflow

The workflow `.github/workflows/notify-website-release.yml` automates notifying the official Lirune website repository whenever a stable release is published in this repository.

## Setup Instructions

1. **Website Repository Target:**
   - By default, the workflow targets `vasanthgajavelly5-sys/Lirune-Website`.
   - To target a different repository name, set the GitHub repository variable `LIRUNE_WEBSITE_REPO` (e.g. `vasanthgajavelly5-sys/Lirune-Website`).

2. **Actions Secret Requirement:**
   - In GitHub Settings > Secrets and variables > Actions, add a repository secret named:
     `LIRUNE_WEBSITE_DISPATCH_TOKEN`
   - Value: A GitHub Personal Access Token (fine-grained) with **Contents: Read and write** permission scoped to the website repository.

3. **Behavior:**
   - Triggers only on stable, published releases (`release.published`).
   - Ignores drafts and pre-releases.
   - Dispatches a `lirune-release-published` event with release metadata to trigger website release synchronisation, validation, build, and Firebase deployment.
