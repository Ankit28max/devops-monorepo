#!/bin/bash
set -e

# ----------------------------------------------------
# 1. System Upgrade & Utilities
# ----------------------------------------------------
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg lsb-release git

# ----------------------------------------------------
# 2. Configure 2 GB Swap File
# ----------------------------------------------------
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ----------------------------------------------------
# 3. Install Docker Engine & Compose Plugin
# ----------------------------------------------------
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
sh /tmp/get-docker.sh
rm /tmp/get-docker.sh

usermod -aG docker ubuntu

# ----------------------------------------------------
# 4. Install Nginx & Certbot
# ----------------------------------------------------
apt install -y nginx certbot python3-certbot-nginx
systemctl enable nginx
systemctl start nginx

echo "Cloud-init initialization completed successfully."
