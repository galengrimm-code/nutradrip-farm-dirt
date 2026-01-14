#!/bin/bash
# Manual version bump script
# Run this before committing to update version and build timestamp

# Get current date in ISO format
BUILD_DATE=$(date +"%Y-%m-%dT%H:%M:%S")

echo "Updating version and build date..."
echo "New BUILD_DATE: $BUILD_DATE"

# Find all HTML files and update
for file in *.html; do
    if [ -f "$file" ]; then
        # Update BUILD_DATE
        sed -i "s/const BUILD_DATE = \"[^\"]*\";/const BUILD_DATE = \"$BUILD_DATE\";/" "$file"

        # Get current version and increment patch
        CURRENT_VERSION=$(grep -oP 'const APP_VERSION = "v\K[0-9]+\.[0-9]+\.[0-9]+' "$file" | head -1)
        if [ ! -z "$CURRENT_VERSION" ]; then
            # Split version into parts
            MAJOR=$(echo $CURRENT_VERSION | cut -d. -f1)
            MINOR=$(echo $CURRENT_VERSION | cut -d. -f2)
            PATCH=$(echo $CURRENT_VERSION | cut -d. -f3)

            # Increment patch version
            NEW_PATCH=$((PATCH + 1))
            NEW_VERSION="v${MAJOR}.${MINOR}.${NEW_PATCH}"

            # Update version in file
            sed -i "s/const APP_VERSION = \"v[0-9]*\.[0-9]*\.[0-9]*\";/const APP_VERSION = \"$NEW_VERSION\";/" "$file"

            echo "  $file: v$CURRENT_VERSION -> $NEW_VERSION"
        fi
    fi
done

echo ""
echo "Done! Version bumped and build date updated."
echo "Now run: git add *.html && git commit -m 'your message'"
