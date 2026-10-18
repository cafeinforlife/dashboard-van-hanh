#!/usr/bin/env bash
# Cài webapp Kiểm Kê lên máy ảo Google Compute Engine (Debian/Ubuntu, e2-micro free tier).
# Dùng Caddy: phục vụ file tĩnh + tự xin chứng chỉ HTTPS (bắt buộc để iPhone mở camera).
#
# Cách chạy (trong cửa sổ SSH của VM):
#   curl -fsSL https://raw.githubusercontent.com/cafeinforlife/dashboard-van-hanh/gh-pages/deploy/setup-gce.sh | bash
#   # hoặc dùng tên miền riêng đã trỏ về IP của VM:
#   curl -fsSL .../setup-gce.sh | bash -s -- kiemke.tencongty.vn
set -euo pipefail

REPO="https://github.com/cafeinforlife/dashboard-van-hanh.git"
BRANCH="gh-pages"
WEB="/var/www/kiemke"
DOMAIN="${1:-}"

if [ -z "$DOMAIN" ]; then
  IP=$(curl -fsS -H 'Metadata-Flavor: Google' \
    http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip)
  # sslip.io: tên miền miễn phí tự trỏ về IP, đủ để xin HTTPS
  DOMAIN="$(echo "$IP" | tr . -).sslip.io"
fi
echo ">> Tên miền: $DOMAIN"

echo ">> Cài gói cần thiết + Caddy"
sudo apt-get update -y
sudo apt-get install -y git curl gnupg debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y
sudo apt-get install -y caddy

echo ">> Thêm 1GB swap (e2-micro chỉ có 1GB RAM)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo ">> Tải mã nguồn app"
if [ -d "$WEB/.git" ]; then
  sudo git -C "$WEB" pull --ff-only
else
  sudo git clone --depth 1 -b "$BRANCH" "$REPO" "$WEB"
fi

echo ">> Cấu hình Caddy"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$DOMAIN {
  root * $WEB
  encode gzip
  file_server
  # Không cho trình duyệt giữ bản cũ của các file này
  @fresh path /sw.js /index.html /js/* /css/*
  header @fresh Cache-Control "no-cache"
  # Không lộ thư mục .git và mã backend
  @hidden path /.git* /backend/* /deploy/*
  respond @hidden 404
}
EOF
sudo systemctl enable --now caddy
sudo systemctl reload caddy

echo ">> Tự cập nhật app mỗi 10 phút từ GitHub"
echo "*/10 * * * * root git -C $WEB pull --ff-only -q" | sudo tee /etc/cron.d/kiemke-update >/dev/null

echo
echo "XONG. Mở trên iPhone (Safari): https://$DOMAIN/"
echo "Lần đầu Caddy cần ~30 giây để xin chứng chỉ HTTPS."
