const WEB_API_URL = "https://script.google.com/macros/s/AKfycbyRrx42FbepIjER0FXUtX6S7fwat7YUBzY-mOST_upOVkNWqGWsFlPIY0ornUL7oM64/exec";

const fetchRemoteConfig = () => {
  return new Promise((resolve) => {
    fetch(WEB_API_URL, {
      method: 'GET',
      redirect: 'follow',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        resolve({
          isActive: data.isActive === true,
          blacklist: Array.isArray(data.blacklist) ? data.blacklist : [],
          whitelist: Array.isArray(data.whitelist) ? data.whitelist : [],
        });
      })
      .catch((error) => {
        console.error('Remote config fetch error:', error);
        resolve(null);
      });
  });
};

const checkCredentials = (email, password) => {
  return new Promise((resolve, reject) => {
    if (!email || !password) {
      reject("Missing credentials!");
      return;
    }
    const data = { email, password };

    fetch(WEB_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: JSON.stringify(data),
      redirect: 'follow',
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        resolve(data);
      })
      .catch((error) => {
        console.error('Auth error:', error);
        reject(error);
      });
  });
};

module.exports = { checkCredentials, fetchRemoteConfig };
