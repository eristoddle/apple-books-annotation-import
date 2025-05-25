#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Get release type from command line argument
const releaseType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(releaseType)) {
	console.error('❌ Invalid release type. Use: patch, minor, or major');
	process.exit(1);
}

console.log(`🚀 Starting ${releaseType} release process...`);

try {
	// Step 1: Build the plugin first to make sure everything works
	console.log('📦 Building plugin...');
	execSync('npm run build', { stdio: 'inherit' });

	// Step 2: Check if we have any uncommitted changes and commit them
	try {
		const status = execSync('git status --porcelain', { encoding: 'utf8' });
		if (status.trim()) {
			console.log('📝 Found uncommitted changes, committing them first...');
			execSync('git add .', { stdio: 'inherit' });
			execSync('git commit -m "Pre-release changes"', { stdio: 'inherit' });
			console.log('✅ Pre-release changes committed');
		}
	} catch (error) {
		console.log('ℹ️  No changes to commit or not in a git repository');
	}

	// Step 3: Run npm version to bump version and create tag
	console.log(`🔢 Bumping ${releaseType} version...`);
	execSync(`npm version ${releaseType}`, { stdio: 'inherit' });

	// Step 4: Get the new version
	const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
	const version = packageJson.version;
	
	// npm version creates a tag with 'v' prefix, so use that
	const tagName = `v${version}`;

	console.log(`🎯 Release version: ${version} (tag: ${tagName})`);

	// Step 5: Push the branch and tag
	console.log('⬆️  Pushing branch...');
	execSync('git push', { stdio: 'inherit' });

	console.log('⬆️  Pushing tag...');
	execSync(`git push origin ${tagName}`, { stdio: 'inherit' });

	console.log('✅ Release created successfully!');
	console.log(`🎉 Version ${version} has been tagged and pushed.`);
	console.log('📋 GitHub Actions will now build and create the release automatically.');
	console.log(`🔗 Check the release at: https://github.com/your-username/your-repo/releases/tag/${tagName}`);

} catch (error) {
	console.error('❌ Release failed:', error.message);
	console.error('💡 Make sure you have a clean git state and all changes are committed.');
	process.exit(1);
}
