/*
 * Parser for Instagram "Download Your Information" JSON exports.
 *
 * Supports:
 *  - A single ZIP export (the whole download from Instagram)
 *  - Individual followers_1.json, followers_2.json, ... and following.json files
 *
 * Everything here runs entirely in the browser. No data is sent anywhere.
 */

const Parser = (() => {

  // Pull usernames out of one parsed JSON document, regardless of which
  // top-level shape Instagram used for it.
  function extractUsernames(json) {
    let entries = [];

    if (Array.isArray(json)) {
      entries = json;
    } else if (json && Array.isArray(json.relationships_following)) {
      entries = json.relationships_following;
    } else if (json && Array.isArray(json.relationships_followers)) {
      entries = json.relationships_followers;
    } else if (json && typeof json === 'object') {
      // Fall back: use the first array-of-objects we find anywhere in the file.
      for (const key of Object.keys(json)) {
        if (Array.isArray(json[key])) {
          entries = json[key];
          break;
        }
      }
    }

    const usernames = new Set();
    entries.forEach((entry) => {
      const list = (entry && entry.string_list_data) || [];
      list.forEach((item) => {
        if (item && item.value) usernames.add(item.value);
      });
    });
    return usernames;
  }

  function isFollowersFile(name) {
    return /followers(_\d+)?\.json$/i.test(name);
  }

  function isFollowingFile(name) {
    return /following\.json$/i.test(name);
  }

  // Parse a single uploaded ZIP (the full Instagram export).
  async function parseZip(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('ZIP support failed to load. Try uploading the JSON files directly instead.');
    }
    const zip = await JSZip.loadAsync(file);
    const followers = new Set();
    const following = new Set();
    const tasks = [];

    zip.forEach((relPath, zipEntry) => {
      if (zipEntry.dir) return;
      const name = relPath.split('/').pop();
      if (isFollowersFile(name)) {
        tasks.push(
          zipEntry.async('string').then((text) => {
            extractUsernames(JSON.parse(text)).forEach((u) => followers.add(u));
          })
        );
      } else if (isFollowingFile(name)) {
        tasks.push(
          zipEntry.async('string').then((text) => {
            extractUsernames(JSON.parse(text)).forEach((u) => following.add(u));
          })
        );
      }
    });

    await Promise.all(tasks);

    if (followers.size === 0 && following.size === 0) {
      throw new Error(
        'Could not find followers_*.json or following.json inside this ZIP. ' +
        'Make sure you exported "Followers and following" in JSON format.'
      );
    }

    return { followers, following };
  }

  // Parse a set of individually-uploaded JSON files
  // (followers_1.json, followers_2.json, following.json, ...).
  async function parseJSONFiles(files) {
    const followers = new Set();
    const following = new Set();
    let matched = 0;

    for (const file of files) {
      const text = await file.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new Error(`"${file.name}" is not valid JSON.`);
      }
      const usernames = extractUsernames(json);

      if (isFollowersFile(file.name)) {
        usernames.forEach((u) => followers.add(u));
        matched++;
      } else if (isFollowingFile(file.name)) {
        usernames.forEach((u) => following.add(u));
        matched++;
      } else {
        // Unknown filename — try to guess from shape.
        if (json && json.relationships_following) {
          usernames.forEach((u) => following.add(u));
          matched++;
        } else if (json && json.relationships_followers) {
          usernames.forEach((u) => followers.add(u));
          matched++;
        }
      }
    }

    if (matched === 0) {
      throw new Error(
        'None of the selected files looked like followers_*.json or following.json. ' +
        'Re-check your Instagram export.'
      );
    }

    return { followers, following };
  }

  // Accounts you follow that do not follow you back, sorted alphabetically.
  function computeNonReciprocal(followers, following) {
    return [...following].filter((u) => !followers.has(u)).sort((a, b) => a.localeCompare(b));
  }

  return { extractUsernames, parseZip, parseJSONFiles, computeNonReciprocal };
})();
