#!/bin/bash

exists=$(npm ls -g @feasibleone/blong-gogo --parseable)
if [[ -z "$exists" ]]; then
    echo "Installing @feasibleone/blong-gogo globally..."
    npm i -g @feasibleone/blong-gogo
else
    echo "@feasibleone/blong-gogo is already installed globally."
fi
blong_gogo=$(npm ls -g @feasibleone/blong-gogo --parseable)
mv -f "$blong_gogo" ./
cp -r blong-gogo/bin/blong.sh "$blong_gogo"/bin/
./blong-gogo/bin/blong.ts
