// OpenWeather API key
const API_KEY = '5aa0dbe9ba5593f6006ea5ed3b4ac491';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEO_URL = 'https://api.openweathermap.org/geo/1.0';

// DOM elements
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const addCityButton = document.getElementById('add-city-button');
const currentWeatherEl = document.getElementById('current-weather');
const forecastCardsEl = document.getElementById('forecast-cards');
const singleViewBtn = document.getElementById('single-view-btn');
const multiViewBtn = document.getElementById('multi-view-btn');
const singleViewEl = document.getElementById('single-view');
const multiViewEl = document.getElementById('multi-view');

// Temperature unit (metric = Celsius, imperial = Fahrenheit)
let tempUnit = localStorage.getItem('tempUnit') || 'metric';
// Current view mode (single or multi)
let viewMode = localStorage.getItem('viewMode') || 'single';
// Cities displayed in multi-view
let displayedCities = JSON.parse(localStorage.getItem('displayedCities')) || [];
// Current city being displayed
let currentCity = '';

// Initialize the app
function init() {
    // Add event listeners
    searchButton.addEventListener('click', handleSearch);
    addCityButton.addEventListener('click', handleAddCity);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    singleViewBtn.addEventListener('click', () => switchView('single'));
    multiViewBtn.addEventListener('click', () => switchView('multi'));
    
    // Add location button if exists
    const locationButton = document.getElementById('location-button');
    if (locationButton) {
        locationButton.addEventListener('click', getCurrentLocationWeather);
    }

    // Set initial view mode
    switchView(viewMode);

    // Setup touch handling for mobile
    setupTouchHandling();
    
    // Register service worker for PWA support
    registerServiceWorker();

    // If there are displayed cities, show them in multi view
    if (displayedCities.length > 0 && viewMode === 'multi') {
        displayedCities.forEach(city => {
            getMultiCityWeather(city);
        });
    } else if (displayedCities.length === 0) {
        // If no cities stored, try to get user's location
        getCurrentLocationWeather();
    }
}

// Switch between single and multi view
function switchView(mode) {
    viewMode = mode;
    localStorage.setItem('viewMode', viewMode);

    if (viewMode === 'single') {
        singleViewEl.style.display = 'flex';
        multiViewEl.style.display = 'none';
        singleViewBtn.classList.add('active');
        multiViewBtn.classList.remove('active');
    } else {
        singleViewEl.style.display = 'none';
        multiViewEl.style.display = 'grid';
        singleViewBtn.classList.remove('active');
        multiViewBtn.classList.add('active');

        // If no cities are displayed in multi-view, add the current city
        if (displayedCities.length === 0 && currentCity) {
            addCityToMultiView(currentCity);
        }
    }
}

// Handle search
function handleSearch() {
    const city = searchInput.value.trim();
    if (city) {
        if (viewMode === 'single') {
            getWeatherData(city);
        } else {
            addCityToMultiView(city);
        }
        searchInput.value = '';
    }
}

// Handle add city button
function handleAddCity() {
    const city = searchInput.value.trim();
    if (city) {
        addCityToMultiView(city);
        searchInput.value = '';
        
        // Switch to multi-view if not already in it
        if (viewMode !== 'multi') {
            switchView('multi');
        }
    }
}

// Add city to multi-view
function addCityToMultiView(city) {
    // Format city name for consistency
    const formattedCity = formatCityName(city);
    
    // Check if city is already displayed
    if (!displayedCities.includes(formattedCity)) {
        displayedCities.push(formattedCity);
        localStorage.setItem('displayedCities', JSON.stringify(displayedCities));
        getMultiCityWeather(formattedCity);
    }
}

// Remove city from multi-view
function removeCityFromMultiView(city) {
    displayedCities = displayedCities.filter(c => c !== city);
    localStorage.setItem('displayedCities', JSON.stringify(displayedCities));
    
    // Remove the city card from the DOM
    const cityCard = document.getElementById(`city-${city.replace(/\s+/g, '-').toLowerCase()}`);
    if (cityCard) {
        cityCard.remove();
    }
}

// Format city name (title case)
function formatCityName(city) {
    return city.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// Get weather data for single view
async function getWeatherData(city) {
    try {
        // Show loading state
        currentWeatherEl.innerHTML = '<div class="loading">Loading...</div>';
        forecastCardsEl.innerHTML = '';

        // Try direct weather API first (this works for city names)
        try {
            console.log(`Trying direct weather API for ${city}...`);
            const directWeatherResponse = await fetch(
                `${BASE_URL}/weather?q=${encodeURIComponent(city)}&units=${tempUnit}&appid=${API_KEY}`
            );
            
            if (!directWeatherResponse.ok) {
                console.log('Direct weather API failed, trying geocoding...');
                throw new Error('direct_api_failed');
            }
            
            const weatherData = await directWeatherResponse.json();
            console.log('Direct weather API data received:', weatherData);
            
            // Now get forecast data
            const forecastResponse = await fetch(
                `${BASE_URL}/forecast?q=${encodeURIComponent(city)}&units=${tempUnit}&appid=${API_KEY}`
            );
            
            if (!forecastResponse.ok) {
                throw new Error('forecast_data_unavailable');
            }
            
            const forecastData = await forecastResponse.json();
            
            // Display weather data
            displayStandardCurrentWeather(weatherData);
            displayStandardForecast(forecastData);
            
            return;
        } catch (directApiError) {
            console.log('Falling back to geocoding API due to:', directApiError.message);
            // Continue with geocoding approach
        }

        // Get coordinates from city name
        const geoResponse = await fetch(
            `${GEO_URL}/direct?q=${encodeURIComponent(city)}&limit=5&appid=${API_KEY}`
        );

        const geoData = await geoResponse.json();

        if (!geoData || geoData.length === 0) {
            throw new Error('city_not_found');
        }

        // Use the first result
        const { lat, lon, name, country, state } = geoData[0];
        
        console.log(`Found coordinates for ${name}: lat=${lat}, lon=${lon}`);
        
        // Fallback to separate weather and forecast APIs
        console.log(`Fetching standard weather API data for ${name}...`);
        const currentWeatherResponse = await fetch(
            `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=${tempUnit}&appid=${API_KEY}`
        );

        if (!currentWeatherResponse.ok) {
            const errorText = await currentWeatherResponse.text();
            console.error('Weather API Error:', errorText);
            throw new Error('weather_data_unavailable');
        }

        const currentWeatherData = await currentWeatherResponse.json();
        console.log('Standard weather API data received:', currentWeatherData);

        // Get 5-day forecast
        console.log(`Fetching forecast API data for ${name}...`);
        const forecastResponse = await fetch(
            `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=${tempUnit}&appid=${API_KEY}`
        );

        if (!forecastResponse.ok) {
            const errorText = await forecastResponse.text();
            console.error('Forecast API Error:', errorText);
            throw new Error('forecast_data_unavailable');
        }

        const forecastData = await forecastResponse.json();
        console.log('Forecast API data received:', forecastData);

        // Display weather data using standard API format
        displayStandardCurrentWeather(currentWeatherData);
        displayStandardForecast(forecastData);

    } catch (error) {
        console.error('Error fetching weather data:', error);
        handleError(error.message, city);
    }
}

// Get weather data for multi-city view
async function getMultiCityWeather(city) {
    try {
        // Create or get city card
        const cityId = `city-${city.replace(/\s+/g, '-').toLowerCase()}`;
        let cityCard = document.getElementById(cityId);
        
        if (!cityCard) {
            cityCard = document.createElement('div');
            cityCard.id = cityId;
            cityCard.classList.add('city-card');
            cityCard.innerHTML = '<div class="loading">Loading...</div>';
            multiViewEl.appendChild(cityCard);
        } else {
            cityCard.innerHTML = '<div class="loading">Loading...</div>';
        }

        // Try direct weather API first (this works for city names)
        try {
            console.log(`Trying direct weather API for ${city} (multi-city)...`);
            const directWeatherResponse = await fetch(
                `${BASE_URL}/weather?q=${encodeURIComponent(city)}&units=${tempUnit}&appid=${API_KEY}`
            );
            
            if (!directWeatherResponse.ok) {
                console.log('Direct weather API failed for multi-city, trying geocoding...');
                throw new Error('direct_api_failed');
            }
            
            const weatherData = await directWeatherResponse.json();
            console.log('Direct weather API data received (multi-city):', weatherData);
            
            // Display weather data
            displayStandardMultiCityWeather(weatherData, cityCard, weatherData.name);
            
            return;
        } catch (directApiError) {
            console.log('Falling back to geocoding API for multi-city due to:', directApiError.message);
            // Continue with geocoding approach
        }

        // Get coordinates from city name
        const geoResponse = await fetch(
            `${GEO_URL}/direct?q=${encodeURIComponent(city)}&limit=5&appid=${API_KEY}`
        );

        const geoData = await geoResponse.json();

        if (!geoData || geoData.length === 0) {
            throw new Error('city_not_found');
        }

        // Use the first result
        const { lat, lon, name, country, state } = geoData[0];
        console.log(`Found coordinates for ${name} (multi-city): lat=${lat}, lon=${lon}`);
        
        // Fallback to standard weather API
        console.log(`Fetching standard weather API data for ${name} (multi-city)...`);
        const currentWeatherResponse = await fetch(
            `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=${tempUnit}&appid=${API_KEY}`
        );

        if (!currentWeatherResponse.ok) {
            const errorText = await currentWeatherResponse.text();
            console.error('Weather API Error (multi-city):', errorText);
            throw new Error('weather_data_unavailable');
        }

        const currentWeatherData = await currentWeatherResponse.json();
        console.log('Standard weather API data received (multi-city):', currentWeatherData);
        
        // Display using standard API format
        displayStandardMultiCityWeather(currentWeatherData, cityCard, name);

    } catch (error) {
        console.error('Error fetching multi-city weather:', error);
        const cityId = `city-${city.replace(/\s+/g, '-').toLowerCase()}`;
        const cityCard = document.getElementById(cityId);
        if (cityCard) {
            if (error.message === 'city_not_found') {
                handleMultiCityError(cityCard, error.message, city);
            } else {
                cityCard.innerHTML = `
                    <div class="error-message">
                        <p>${getErrorMessage(error.message)}</p>
                    </div>
                    <button class="remove-city"><i class="fas fa-times"></i></button>
                `;
                
                const removeBtn = cityCard.querySelector('.remove-city');
                removeBtn.addEventListener('click', () => removeCityFromMultiView(city));
            }
        }
    }
}

// Handle multi-city view errors with suggestions
async function handleMultiCityError(cityCard, errorType, searchQuery) {
    if (errorType === 'city_not_found') {
        try {
            // Try to find similar cities
            // Use only the first word of the search query to find similar cities
            const firstWord = searchQuery.split(' ')[0];
            console.log(`Searching for similar cities (multi-city) using: ${firstWord}`);
            
            const response = await fetch(
                `${GEO_URL}/direct?q=${encodeURIComponent(firstWord)}&limit=3&appid=${API_KEY}`
            );
            
            const similarCities = await response.json();
            console.log('Similar cities found (multi-city):', similarCities);
            
            if (similarCities && similarCities.length > 0) {
                displayMultiCitySuggestions(cityCard, searchQuery, similarCities);
            } else {
                cityCard.innerHTML = `
                    <div class="error-message">
                        <p>City "${searchQuery}" not found.</p>
                    </div>
                    <button class="remove-city"><i class="fas fa-times"></i></button>
                `;
                
                const removeBtn = cityCard.querySelector('.remove-city');
                removeBtn.addEventListener('click', () => removeCityFromMultiView(searchQuery));
            }
        } catch (error) {
            console.error('Error finding similar cities (multi-city):', error);
            cityCard.innerHTML = `
                <div class="error-message">
                    <p>City "${searchQuery}" not found.</p>
                </div>
                <button class="remove-city"><i class="fas fa-times"></i></button>
            `;
            
            const removeBtn = cityCard.querySelector('.remove-city');
            removeBtn.addEventListener('click', () => removeCityFromMultiView(searchQuery));
        }
    }
}

// Display multi-city suggestions
function displayMultiCitySuggestions(cityCard, searchQuery, suggestions) {
    const suggestionsHTML = suggestions.map(city => {
        const cityName = city.name || '';
        const countryCode = city.country || '';
        const displayName = countryCode ? `${cityName}, ${countryCode}` : cityName;
        return `<button class="suggestion-btn" data-city="${displayName}">${displayName}</button>`;
    }).join('');

    cityCard.innerHTML = `
        <div class="error-message">
            <p>City "${searchQuery}" not found.</p>
        </div>
        <div class="suggestions">
            <p>Did you mean:</p>
            <div class="suggestion-buttons">
                ${suggestionsHTML}
            </div>
        </div>
        <button class="remove-city"><i class="fas fa-times"></i></button>
    `;

    // Add event listeners to suggestion buttons
    const suggestionBtns = cityCard.querySelectorAll('.suggestion-btn');
    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const suggestedCity = btn.getAttribute('data-city');
            // Remove the current city card
            removeCityFromMultiView(searchQuery);
            // Add the suggested city
            addCityToMultiView(suggestedCity);
        });
    });
    
    // Add event listener to remove button
    const removeBtn = cityCard.querySelector('.remove-city');
    removeBtn.addEventListener('click', () => removeCityFromMultiView(searchQuery));
}

// Toggle temperature unit
function toggleTempUnit() {
    tempUnit = tempUnit === 'metric' ? 'imperial' : 'metric';
    localStorage.setItem('tempUnit', tempUnit);
    
    // Refresh weather data based on current view
    if (viewMode === 'single' && currentCity) {
        getWeatherData(currentCity);
    } else if (viewMode === 'multi') {
        // Refresh all displayed cities
        multiViewEl.innerHTML = '';
        displayedCities.forEach(city => {
            getMultiCityWeather(city);
        });
    }
}

// Get temperature unit symbol
function getTempUnitSymbol() {
    return tempUnit === 'metric' ? '°C' : '°F';
}

// Get wind speed unit
function getWindSpeedUnit() {
    return tempUnit === 'metric' ? 'm/s' : 'mph';
}

// Handle errors with suggestions
async function handleError(errorType, searchQuery) {
    if (errorType === 'city_not_found') {
        displayErrorWithSuggestions(searchQuery);
    } else {
        currentWeatherEl.innerHTML = `
            <div class="error-message">
                <p><i class="fas fa-exclamation-triangle"></i> ${getErrorMessage(errorType)}</p>
            </div>
        `;
        forecastCardsEl.innerHTML = '';
    }
}

// Get user-friendly error message
function getErrorMessage(errorType) {
    switch (errorType) {
        case 'city_not_found':
            return 'City not found. Please check the spelling and try again.';
        case 'weather_data_unavailable':
            return 'Weather data is currently unavailable. Please try again later.';
        case 'forecast_data_unavailable':
            return 'Forecast data is currently unavailable. Please try again later.';
        case 'onecall_unavailable':
            return 'Weather service is temporarily unavailable. Trying alternative source...';
        case 'direct_api_failed':
            return 'Direct weather lookup failed. Trying alternative method...';
        default:
            return 'An error occurred. Please try again later.';
    }
}

// Display error with city suggestions
async function displayErrorWithSuggestions(searchQuery) {
    try {
        // Try to find similar cities
        // Use only the first word of the search query to find similar cities
        const firstWord = searchQuery.split(' ')[0];
        console.log(`Searching for similar cities using: ${firstWord}`);
        
        const response = await fetch(
            `${GEO_URL}/direct?q=${encodeURIComponent(firstWord)}&limit=5&appid=${API_KEY}`
        );
        
        const similarCities = await response.json();
        console.log('Similar cities found:', similarCities);
        
        if (similarCities && similarCities.length > 0) {
            const suggestionsHTML = similarCities.map(city => {
                const cityName = city.name || '';
                const countryCode = city.country || '';
                const displayName = countryCode ? `${cityName}, ${countryCode}` : cityName;
                return `<button class="suggestion-btn" data-city="${displayName}">${displayName}</button>`;
            }).join('');

            currentWeatherEl.innerHTML = `
                <div class="error-message">
                    <p><i class="fas fa-search"></i> City "${searchQuery}" not found.</p>
                </div>
                <div class="suggestions">
                    <p>Did you mean:</p>
                    <div class="suggestion-buttons">
                        ${suggestionsHTML}
                    </div>
                </div>
            `;

            // Add event listeners to suggestion buttons
            const suggestionBtns = currentWeatherEl.querySelectorAll('.suggestion-btn');
            suggestionBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const suggestedCity = btn.getAttribute('data-city');
                    getWeatherData(suggestedCity);
                });
            });
        } else {
            currentWeatherEl.innerHTML = `
                <div class="error-message">
                    <p><i class="fas fa-exclamation-triangle"></i> City "${searchQuery}" not found. Please check the spelling or try a different city.</p>
                </div>
            `;
        }
        
        forecastCardsEl.innerHTML = '';
    } catch (error) {
        console.error('Error finding similar cities:', error);
        currentWeatherEl.innerHTML = `
            <div class="error-message">
                <p><i class="fas fa-exclamation-triangle"></i> City "${searchQuery}" not found. Please check the spelling or try a different city.</p>
            </div>
        `;
        forecastCardsEl.innerHTML = '';
    }
}

// Display current weather using standard API format
function displayStandardCurrentWeather(data) {
    try {
        if (!data || !data.weather || !data.main || !data.wind) {
            throw new Error('Incomplete weather data');
        }
        
        currentCity = data.name; // Store current city
        
        const date = new Date();
        const formattedDate = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const time = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const unitSymbol = getTempUnitSymbol();
        const windUnit = getWindSpeedUnit();
        const country = data.sys && data.sys.country ? data.sys.country : '';

        // Calculate wind direction
        const windDirection = getWindDirection(data.wind.deg);
        
        // Calculate sunrise and sunset times
        const sunrise = data.sys && data.sys.sunrise ? new Date(data.sys.sunrise * 1000).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        }) : 'N/A';
        const sunset = data.sys && data.sys.sunset ? new Date(data.sys.sunset * 1000).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        }) : 'N/A';

        const html = `
            <h2><i class="fas fa-map-marker-alt"></i> ${data.name}${country ? `, ${country}` : ''}</h2>
            <p><i class="far fa-calendar-alt"></i> ${formattedDate}</p>
            <p><i class="far fa-clock"></i> Last updated: ${time}</p>
            <div class="unit-toggle">
                <button id="unit-toggle-btn">${tempUnit === 'metric' ? 'Switch to °F' : 'Switch to °C'}</button>
            </div>
            <div class="weather-details">
                <div class="weather-main">
                    <img src="https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png" alt="${data.weather[0].description}" class="weather-icon">
                    <p class="weather-description">${data.weather[0].description}</p>
                </div>
                <div class="temperature-container">
                    <p class="temperature">${Math.round(data.main.temp)}${unitSymbol}</p>
                    <p class="feels-like">Feels like: ${Math.round(data.main.feels_like)}${unitSymbol}</p>
                    <p class="temp-minmax">
                        <span class="temp-max"><i class="fas fa-temperature-high"></i> High: ${Math.round(data.main.temp_max)}${unitSymbol}</span>
                        <span class="temp-min"><i class="fas fa-temperature-low"></i> Low: ${Math.round(data.main.temp_min)}${unitSymbol}</span>
                    </p>
                </div>
                <div class="weather-info">
                    <div class="info-group">
                        <h3><i class="fas fa-sun"></i> Sun & Moon</h3>
                        <p><i class="fas fa-sunrise"></i> Sunrise: ${sunrise}</p>
                        <p><i class="fas fa-sunset"></i> Sunset: ${sunset}</p>
                    </div>
                    <div class="info-group">
                        <h3><i class="fas fa-wind"></i> Wind & Pressure</h3>
                        <p><i class="fas fa-location-arrow" style="transform: rotate(${data.wind.deg}deg)"></i> Wind: ${data.wind.speed} ${windUnit} ${windDirection}</p>
                        <p><i class="fas fa-compress-alt"></i> Pressure: ${data.main.pressure} hPa</p>
                        ${data.wind.gust ? `<p><i class="fas fa-wind"></i> Gusts: ${data.wind.gust} ${windUnit}</p>` : ''}
                    </div>
                    <div class="info-group">
                        <h3><i class="fas fa-tint"></i> Humidity & Visibility</h3>
                        <p><i class="fas fa-tint"></i> Humidity: ${data.main.humidity}%</p>
                        ${data.visibility ? `<p><i class="fas fa-eye"></i> Visibility: ${(data.visibility / 1000).toFixed(1)} km</p>` : ''}
                        ${data.clouds ? `<p><i class="fas fa-cloud"></i> Cloud Cover: ${data.clouds.all}%</p>` : ''}
                    </div>
                </div>
            </div>
        `;

        currentWeatherEl.innerHTML = html;

        // Add event listener to unit toggle button
        const unitToggleBtn = document.getElementById('unit-toggle-btn');
        if (unitToggleBtn) {
            unitToggleBtn.addEventListener('click', toggleTempUnit);
        }
    } catch (error) {
        console.error('Error displaying current weather:', error);
        currentWeatherEl.innerHTML = `
            <div class="error-message">
                <p><i class="fas fa-exclamation-triangle"></i> Unable to display weather data. Please try again.</p>
            </div>
        `;
    }
}

// Helper function to get wind direction from degrees
function getWindDirection(degrees) {
    if (degrees === undefined) return '';
    
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(((degrees % 360) / 22.5));
    return directions[index % 16];
}

// Display multi-city weather using standard API format
function displayStandardMultiCityWeather(data, cityCard, cityName) {
    try {
        if (!data || !data.weather || !data.main || !data.wind) {
            throw new Error('Incomplete weather data');
        }
        
        const unitSymbol = getTempUnitSymbol();
        const windUnit = getWindSpeedUnit();
        const country = data.sys && data.sys.country ? data.sys.country : '';

        cityCard.innerHTML = `
            <h2><i class="fas fa-map-marker-alt"></i> ${data.name}${country ? `, ${country}` : ''}</h2>
            <div class="weather-details">
                <div>
                    <img src="https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png" alt="${data.weather[0].description}" class="weather-icon">
                    <p>${data.weather[0].description}</p>
                </div>
                <div>
                    <p class="temperature">${Math.round(data.main.temp)}${unitSymbol}</p>
                    <p>Feels like: ${Math.round(data.main.feels_like)}${unitSymbol}</p>
                </div>
                <div class="weather-info">
                    <p><i class="fas fa-tint"></i> Humidity: ${data.main.humidity}%</p>
                    <p><i class="fas fa-wind"></i> Wind: ${data.wind.speed} ${windUnit}</p>
                </div>
            </div>
            <button class="remove-city"><i class="fas fa-times"></i></button>
        `;

        // Add event listener to remove button
        const removeBtn = cityCard.querySelector('.remove-city');
        removeBtn.addEventListener('click', () => removeCityFromMultiView(cityName));
    } catch (error) {
        console.error('Error displaying multi-city weather:', error);
        cityCard.innerHTML = `
            <div class="error-message">
                <p><i class="fas fa-exclamation-triangle"></i> Unable to display weather data for ${cityName}.</p>
            </div>
            <button class="remove-city"><i class="fas fa-times"></i></button>
        `;
        
        const removeBtn = cityCard.querySelector('.remove-city');
        removeBtn.addEventListener('click', () => removeCityFromMultiView(cityName));
    }
}

// Display 5-day forecast using standard API format
function displayStandardForecast(data) {
    try {
        if (!data || !data.list || data.list.length === 0) {
            throw new Error('No forecast data available');
        }
        
        // Group forecast data by day
        const dailyForecasts = {};
        
        data.list.forEach(item => {
            const date = new Date(item.dt * 1000);
            const day = date.toLocaleDateString('en-US', { weekday: 'short' });
            
            if (!dailyForecasts[day]) {
                dailyForecasts[day] = {
                    date: date,
                    temps: [],
                    icons: [],
                    descriptions: []
                };
            }
            
            dailyForecasts[day].temps.push(item.main.temp);
            dailyForecasts[day].icons.push(item.weather[0].icon);
            dailyForecasts[day].descriptions.push(item.weather[0].description);
        });
        
        // Convert to array and take first 5 days
        const forecastDays = Object.keys(dailyForecasts).slice(0, 5);
        
        if (forecastDays.length === 0) {
            throw new Error('No forecast days available');
        }
        
        const unitSymbol = getTempUnitSymbol();
        
        const html = forecastDays.map(day => {
            const forecast = dailyForecasts[day];
            const temps = forecast.temps;
            const maxTemp = Math.round(Math.max(...temps));
            const minTemp = Math.round(Math.min(...temps));
            
            // Get the most common icon
            const iconCounts = {};
            forecast.icons.forEach(icon => {
                iconCounts[icon] = (iconCounts[icon] || 0) + 1;
            });
            let mostCommonIcon = forecast.icons[0];
            let maxCount = 0;
            for (const icon in iconCounts) {
                if (iconCounts[icon] > maxCount) {
                    maxCount = iconCounts[icon];
                    mostCommonIcon = icon;
                }
            }
            
            // Get the most common description
            const descCounts = {};
            forecast.descriptions.forEach(desc => {
                descCounts[desc] = (descCounts[desc] || 0) + 1;
            });
            let mostCommonDesc = forecast.descriptions[0];
            maxCount = 0;
            for (const desc in descCounts) {
                if (descCounts[desc] > maxCount) {
                    maxCount = descCounts[desc];
                    mostCommonDesc = desc;
                }
            }
            
            const date = forecast.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            return `
                <div class="forecast-card">
                    <h3>${day}</h3>
                    <p>${date}</p>
                    <img src="https://openweathermap.org/img/wn/${mostCommonIcon}@2x.png" alt="${mostCommonDesc}">
                    <p class="forecast-temp">${Math.round((maxTemp + minTemp) / 2)}${unitSymbol}</p>
                    <div class="forecast-minmax">
                        <span class="forecast-max">${maxTemp}${unitSymbol}</span> / 
                        <span class="forecast-min">${minTemp}${unitSymbol}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        forecastCardsEl.innerHTML = html;
    } catch (error) {
        console.error('Error displaying forecast:', error);
        forecastCardsEl.innerHTML = `
            <div class="no-forecast">
                <p><i class="fas fa-cloud-rain"></i> Forecast data is currently unavailable.</p>
            </div>
        `;
    }
}

// Get current location weather using geolocation
function getCurrentLocationWeather() {
    if (navigator.geolocation) {
        // Show loading state while getting location
        currentWeatherEl.innerHTML = '<div class="loading">Detecting your location...</div>';
        forecastCardsEl.innerHTML = '';
        
        navigator.geolocation.getCurrentPosition(
            // Success callback
            position => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                
                // Fetch weather data using coordinates
                fetchWeatherByCoordinates(lat, lon);
            },
            // Error callback
            error => {
                console.error('Geolocation error:', error);
                currentWeatherEl.innerHTML = `
                    <div class="error-message">
                        <p><i class="fas fa-map-marker-alt"></i> Unable to get your location. ${error.message}</p>
                        <button id="retry-location" class="suggestion-btn">Retry</button>
                    </div>
                `;
                
                // Add event listener to retry button
                const retryBtn = document.getElementById('retry-location');
                if (retryBtn) {
                    retryBtn.addEventListener('click', getCurrentLocationWeather);
                }
            },
            // Options
            {
                timeout: 10000,
                enableHighAccuracy: true
            }
        );
    } else {
        currentWeatherEl.innerHTML = `
            <div class="error-message">
                <p><i class="fas fa-exclamation-triangle"></i> Geolocation is not supported by your browser.</p>
            </div>
        `;
    }
}

// Fetch weather data using coordinates
async function fetchWeatherByCoordinates(lat, lon) {
    try {
        // Show loading state
        currentWeatherEl.innerHTML = '<div class="loading">Loading weather data...</div>';
        
        // Fetch current weather
        const weatherResponse = await fetch(
            `${BASE_URL}/weather?lat=${lat}&lon=${lon}&units=${tempUnit}&appid=${API_KEY}`
        );
        
        if (!weatherResponse.ok) {
            throw new Error('weather_data_unavailable');
        }
        
        const weatherData = await weatherResponse.json();
        
        // Fetch forecast
        const forecastResponse = await fetch(
            `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&units=${tempUnit}&appid=${API_KEY}`
        );
        
        if (!forecastResponse.ok) {
            throw new Error('forecast_data_unavailable');
        }
        
        const forecastData = await forecastResponse.json();
        
        // Display weather data
        displayStandardCurrentWeather(weatherData);
        displayStandardForecast(forecastData);
        
    } catch (error) {
        console.error('Error fetching weather by coordinates:', error);
        currentWeatherEl.innerHTML = `
            <div class="error-message">
                <p><i class="fas fa-exclamation-triangle"></i> ${getErrorMessage(error.message)}</p>
            </div>
        `;
        forecastCardsEl.innerHTML = '';
    }
}

// Mobile touch swipe detection for switching views
function setupTouchHandling() {
    let startX, startY;
    const threshold = 100; // Minimum pixels traveled for a swipe
    
    // Add touch event listeners to the main content area
    document.getElementById('weather-container').addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, false);
    
    document.getElementById('weather-container').addEventListener('touchend', (e) => {
        if (!startX || !startY) return;
        
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        
        const diffX = startX - endX;
        const diffY = startY - endY;
        
        // Horizontal swipe detected (and not vertical scrolling)
        if (Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 0) {
                // Swipe left - go to multi view
                switchView('multi');
            } else {
                // Swipe right - go to single view
                switchView('single');
            }
        }
        
        startX = startY = null;
    }, false);
}

// Check for service worker support and register it
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
        });
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', init); 