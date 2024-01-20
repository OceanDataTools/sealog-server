#!/bin/bash

# Get the current directory
current_dir=$(pwd)

# Function to handle errors
handle_error() {
    echo "Error occurred in script at line $1."
    # You can add additional error handling logic here
    cd $current_dir
    exit 1
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# Get the directory of the script
script_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
echo "Script directory is: $script_dir"

# Get the parent directory
install_dir="$(dirname "$script_dir")"
echo "Install directory is: $install_dir"

cd $install_dir

echo "Creating python virtual environment"
python3 -m venv venv

echo "Activating python virtual environment"
source venv/bin/activate

echo "Installing python libraries"
pip install -r requirements.txt

echo "Choose an option:"
echo "1. Sealog-FKt"
echo "2. Sealog-Sub"

read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        echo "You chose Sealog-FKt."

        echo "Setting up git pre-commit hook"
        cat <<EOF > .git/hooks/pre-commit
#!/bin/bash

# This is the pre-commit hook

# Update pip requirements file
$install_dir/venv/bin/pip freeze > $install_dir/requirements.txt
git add "$install_dir/requirements.txt"

# Copy production config files to their repo filenames
cp "$install_dir/config/db_constants.js" "$install_dir/config/db_constants_FKt.js"
cp "$install_dir/config/email_constants.js" "$install_dir/config/email_constants_FKt.js"
cp "$install_dir/config/manifest.js" "$install_dir/config/manifest_FKt.js"
cp "$install_dir/config/path_constants.js" "$install_dir/config/path_constants_FKt.js"
cp "$install_dir/config/secret.js" "$install_dir/config/secret_FKt.js"

# Stage the changes
git add "$install_dir"

# Continue with the commit
exit 0
EOF

        chmod +x .git/hooks/pre-commit

        echo "Setting up git post-checkout hook"
        cat <<EOF > .git/hooks/post-checkout
#!/bin/bash

# This is the post-checkout hook

$install_dir/venv/bin/pip install -r $install_dir/requirements.txt

# Copy repo config files to their production filenames
cp $install_dir/config/db_constants_FKt.js" "$install_dir/config/db_constants.js"
cp $install_dir/config/email_constants_FKt.js" "$install_dir/config/email_constants.js"
cp $install_dir/config/manifest_FKt.js" "$install_dir/config/manifest.js"
cp $install_dir/config/path_constants_FKt.js" "$install_dir/config/path_constants.js"
cp $install_dir/config/secret_FKt.js" "$install_dir/config/secret.js"

# Stage the changes
git add "$install_dir"

# Continue with the commit
exit 0
EOF

        chmod +x .git/hooks/post-checkout

        echo "Building supervisor config file"
        sudo cat <<EOF > /etc/supervisor/conf.d/sealog-server-FKt.conf
[program:sealog-server-FKt]
directory=/opt/sealog-server-FKt
command=node server.js
environment=NODE_ENV="production"
redirect_stderr=true
stdout_logfile=/var/log/sealog-server-FKt_STDOUT.log
user=mt
autostart=true
autorestart=true

[program:sealog-asnap-FKt]
directory=/opt/sealog-server-FKt
command=/opt/sealog-server-FKt/venv/bin/python ./misc/sealog_asnap.py --interval 300
redirect_stderr=true
stdout_logfile=/var/log/sealog-asnap-FKt_STDOUT.log
user=mt
autostart=true
autorestart=true
stopsignal=QUIT

[program:sealog-aux-data-influx-FKt]
directory=/opt/sealog-server-FKt
command=/opt/sealog-server-FKt/venv/bin/python ./misc/sealog_aux_data_inserter_influx.py -f ./misc/sealog_influx_embed_FKt.yml
redirect_stderr=true
stdout_logfile=/var/log/sealog-aux-data-influx-FKt_STDOUT.log
user=mt
autostart=true
autorestart=true
stopsignal=QUIT

[program:sealog-cruise-sync-FKt]
directory=/opt/sealog-server-FKt
command=/opt/sealog-server-FKt/venv/bin/python ./misc/sealog_cruise_sync.py
redirect_stderr=true
stdout_logfile=/var/log/sealog-cruise-sync-FKt_STDOUT.log
user=mt
autostart=true
autorestart=true
stopsignal=QUIT

[program:sealog-post-cruise-data-export-FKt]
directory=/opt/sealog-server-FKt
command=/opt/sealog-server-FKt/venv/bin/python ./misc/sealog_vessel_data_export.py
redirect_stderr=true
stdout_logfile=/var/log/sealog-data-export-FKt_STDOUT.log
user=mt
autostart=false
autorestart=false
stopsignal=QUIT
EOF
        ;;
    2)
        echo "You chose Sealog-Sub."

        echo "Setting up git pre-commit hook"
        cat <<EOF > .git/hooks/pre-commit
#!/bin/bash

# This is the pre-commit hook

# Update pip requirements file
$install_dir/venv/bin/pip freeze > $install_dir/requirements.txt
git add "$install_dir/requirements.txt"

# Copy production config files to their repo filenames
cp "$install_dir/config/db_constants.js" "$install_dir/config/db_constants_Sub.js"
cp "$install_dir/config/email_constants.js" "$install_dir/config/email_constants_Sub.js"
cp "$install_dir/config/manifest.js" "$install_dir/config/manifest_Sub.js"
cp "$install_dir/config/path_constants.js" "$install_dir/config/path_constants_Sub.js"
cp "$install_dir/config/secret.js" "$install_dir/config/secret_Sub.js"

# Stage the changes
git add "$install_dir"

# Continue with the commit
exit 0
EOF

        chmod +x .git/hooks/pre-commit

        echo "Setting up git post-checkout hook"
        cat <<EOF > .git/hooks/post-checkout
#!/bin/bash

# This is the post-checkout hook

$install_dir/venv/bin/pip install -r $install_dir/requirements.txt

# Copy repo config files to their production filenames
cp $install_dir/config/db_constants_Sub.js" "$install_dir/config/db_constants.js"
cp $install_dir/config/email_constants_Sub.js" "$install_dir/config/email_constants.js"
cp $install_dir/config/manifest_Sub.js" "$install_dir/config/manifest.js"
cp $install_dir/config/path_constants_Sub.js" "$install_dir/config/path_constants.js"
cp $install_dir/config/secret_Sub.js" "$install_dir/config/secret.js"

# Stage the changes
git add "$install_dir"

# Continue with the commit
exit 0
EOF

        chmod +x .git/hooks/post-checkout

        echo "Building supervisor config file"
        sudo cat <<EOF > /etc/supervisor/conf.d/sealog-server-Sub.conf
[program:sealog-server-Sub]
directory=/opt/sealog-server-Sub
command=node server.js
environment=NODE_ENV="production"
redirect_stderr=true
stdout_logfile=/var/log/sealog-server-Sub_STDOUT.log
user=mt
autostart=true
autorestart=true

[program:sealog-asnap-Sub]
directory=/opt/sealog-server-Sub
command=/opt/sealog-server-Sub/venv/bin/python ./misc/sealog_asnap.py -i 10
redirect_stderr=true
stdout_logfile=/var/log/sealog-asnap-Sub_STDOUT.log
user=mt
autostart=true
autorestart=true
stopsignal=QUIT

[program:sealog-asnap-Sub-1Hz]
directory=/opt/sealog-server-Sub
command=/opt/sealog-server-Sub/venv/bin/python ./misc/sealog_asnap.py -i 1 -t 60
redirect_stderr=true
stdout_logfile=/var/log/sealog-asnap-Sub_STDOUT.log
user=mt
autostart=false
autorestart=true
stopsignal=QUIT

[program:sealog-auto-actions-Sub]
directory=/opt/sealog-server-Sub
command=/opt/sealog-server-Sub/venv/bin/python ./misc/sealog_auto_actions.py
redirect_stderr=true
stdout_logfile=/var/log/sealog-auto-actions-Sub_STDOUT.log
user=mt
autostart=true
autorestart=true
stopsignal=QUIT

[program:sealog-aux-data-influx-Sub]
directory=/opt/sealog-server-Sub
command=/opt/sealog-server-Sub/venv/bin/python ./misc/sealog_aux_data_inserter_influx.py -f ./misc/sealog_influx_embed_Sub.yml
redirect_stderr=true
stdout_logfile=/var/log/sealog-aux-data-inserter-influx-Sub_STDOUT.log
user=mt
autostart=true
autorestart=true
stopsignal=QUIT

[program:sealog-aux-data-framegrab-Sub]
directory=/opt/sealog-server-Sub
command=/opt/sealog-server-Sub/venv/bin/python ./misc/sealog_aux_data_inserter_framegrab.py
redirect_stderr=true
stdout_logfile=/var/log/sealog-aux-data-inserter-framegrab-Sub_STDOUT.log
user=mt
autostart=true
autorestart=true
stopsignal=QUIT

[program:sealog-post-dive-data-export-Sub]
directory=/opt/sealog-server-Sub
command=/opt/sealog-server-Sub/venv/bin/python ./misc/sealog_vehicle_data_export.py
redirect_stderr=true
stdout_logfile=/var/log/sealog-data-export_STDOUT.log
user=mt
autostart=false
autorestart=false
stopsignal=QUIT

[program:sealog-post-cruise-data-export-Sub]
directory=/opt/sealog-server-Sub
command=/opt/sealog-server-Sub/venv/bin/python ./misc/sealog_vehicle_data_export.py -c
redirect_stderr=true
stdout_logfile=/var/log/sealog-data-export_STDOUT.log
user=mt
autostart=false
autorestart=false
stopsignal=QUIT
EOF
;;
    *)
        echo "Invalid choice. Please enter 1 or 2."
        ;;
esac

echo "Setup Sealog config files"
.git/hooks/post-checkout

echo "Starting supervisor processes"
sudo supervisorctl reread
sudo supervisorctl update

# Down
cd $current_dir
