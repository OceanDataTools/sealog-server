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
python -m venv ./venv

echo "Activating python virtual environment"
source ./venv/bin/activate

echo "Installing python libraries"
pip install -r ./requirements.txt

echo "Choose an option:"
echo "1. Sealog-FKt"
echo "2. Sealog-Sub"

read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        echo "You chose Sealog-FKt."
        echo "Copying over Fkt config files"
        cp ./config/db_constants_FKt.js ./config/db_constants.js
        cp ./config/email_constants_FKt.js ./config/email_constants.js
        cp ./config/manifest_FKt.js ./config/manifest.js
        cp ./config/path_constants_FKt.js ./config/path_constants.js
        cp ./config/secret_FKt.js ./config/secret.js

        echo "Building supervisor config file"

        ;;
    2)
        echo "You chose Sealog-Sub."
        echo "Copying over Fkt config files"
        cp ./config/db_constants_Sub.js ./config/db_constants.js
        cp ./config/email_constants_Sub.js ./config/email_constants.js
        cp ./config/manifest_Sub.js ./config/manifest.js
        cp ./config/path_constants_Sub.js ./config/path_constants.js
        cp ./config/secret_Sub.js ./config/secret.js

        echo "Building supervisor config file"

        ;;
    *)
        echo "Invalid choice. Please enter 1 or 2."
        ;;
esac

# Down
cd $current_dir