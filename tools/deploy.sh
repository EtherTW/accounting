#!/bin/bash
set -x

# setup ssh-agent and provide the GitHub deploy key
eval "$(ssh-agent -s)"
openssl aes-256-cbc \
    -K $encrypted_981fa0896ec6_key \
    -iv $encrypted_981fa0896ec6_iv \
    -in id_rsa_tem_accounting.enc \
    -out id_rsa_tem_accounting -d
chmod 600 id_rsa_tem_accounting
ssh-add id_rsa_tem_accounting

# commit the assets in build/ to the gh-pages branch and push to GitHub using SSH
cd $TRAVIS_BUILD_DIR/build
git config --global user.email "nobody@nobody.org"
git config --global user.name "Travis CI"
git init
git add .
git commit -m "Deploy to Github Pages"
git push --force "git@github.com:${TRAVIS_REPO_SLUG}.git" master:gh-pages
