#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// Get release type from command line argument
const releaseType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(releaseType)) {
	console.error('❌ Invalid release type. Use: patch, minor, or major');
	process.exit(1);
}

// Build the release page URL from the `origin` remote, handling both the HTTPS and the
// SSH remote forms. Returns null if origin is missing or is not a GitHub remote.
function getReleaseUrl(tagName) {
	try {
		const origin = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
		const match = origin.match(/github\.com[:/](.+?)(?:\.git)?$/);
		return match ? `https://github.com/${match[1]}/releases/tag/${tagName}` : null;
	} catch {
		return null;
	}
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

	// Step 4: Get the new version and find the actual tag that was created
	const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
	const version = packageJson.version;
	
	// Check which tag format was actually created
	let tagName;
	try {
		const tags = execSync('git tag -l', { encoding: 'utf8' });
		if (tags.includes(`v${version}`)) {
			tagName = `v${version}`;
		} else if (tags.includes(version)) {
			tagName = version;
		} else {
			throw new Error(`No tag found for version ${version}`);
		}
	} catch (error) {
		console.error('❌ Could not find the created tag');
		throw error;
	}

	console.log(`🎯 Release version: ${version} (tag: ${tagName})`);

	// Step 5: Push the branch and tag
	console.log('⬆️  Pushing branch...');
	execSync('git push', { stdio: 'inherit' });

	console.log('⬆️  Pushing tag...');
	execSync(`git push origin ${tagName}`, { stdio: 'inherit' });

	console.log('✅ Release created successfully!');
	console.log(`🎉 Version ${version} has been tagged and pushed.`);
	console.log('📋 GitHub Actions will now build and create the release automatically.');
	const releaseUrl = getReleaseUrl(tagName);
	if (releaseUrl) console.log(`🔗 Check the release at: ${releaseUrl}`);

} catch (error) {
	console.error('❌ Release failed:', error.message);
	console.error('💡 Make sure you have a clean git state and all changes are committed.');
	process.exit(1);
}
