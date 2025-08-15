# Stop and disable Redis
sudo systemctl stop redis-server
sudo systemctl disable redis-server

# Purge Redis completely
sudo apt-get purge -y redis-server redis-tools

# Clean up directories
sudo rm -rf /var/lib/redis
sudo rm -rf /var/log/redis
sudo rm -rf /etc/redis

# Reinstall Redis
sudo apt-get update
sudo apt-get install -y redis-server

# Start Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
sudo systemctl status redis-server

# Check if Redis is listening
sudo ss -tlnp | grep 6379

# Check what's on port 6379
sudo lsof -i :6379

# get config
redis-cli CONFIG GET config_file

# pid with name
ps -e -o pid,comm --sort pid
