#!/bin/bash
# LearnFlow AI Server Launcher
cd "/home/alpha/LearnFlow AI"
pkill -f "node server.js" 2>/dev/null
sleep 1
echo "Starting LearnFlow AI Server..."
node server.js
