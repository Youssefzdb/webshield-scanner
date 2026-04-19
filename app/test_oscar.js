const url = "https://admin.dramaramadan.net/api/seasons/?series_id=1";
console.log("Fetching:", url);
fetch(url, {
    headers: {
        'User-Agent': 'OscarTV/1.0.9 (Android; 13)',
        'Accept': 'application/json',
    }
}).then(res => {
    console.log("Status:", res.status);
    return res.text();
}).then(text => {
    console.log("Body:", text.substring(0, 500));
}).catch(console.error);
