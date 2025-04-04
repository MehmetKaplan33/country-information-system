require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// API keylerini kontrol et
console.log('Environment variables check:');
console.log('WEATHER_API_KEY:', process.env.WEATHER_API_KEY ? 'Set ✓' : 'Not set ✗');
console.log('GEOCODE_API_KEY:', process.env.GEOCODE_API_KEY ? 'Set ✓' : 'Not set ✗');
console.log('EXCHANGE_RATE_API_KEY:', process.env.EXCHANGE_RATE_API_KEY ? 'Set ✓' : 'Not set ✗');

// Weather endpoint - daha detaylı hata loglama
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        
        console.log('Weather API Request:', {
            lat,
            lon,
            apiKey: process.env.WEATHER_API_KEY?.substring(0, 5) + '...'
        });

        const url = `https://api.openweathermap.org/data/2.5/weather`;
        console.log('Making request to:', url);

        const response = await axios.get(url, {
            params: {
                lat,
                lon,
                appid: process.env.WEATHER_API_KEY,
                units: 'metric',
                lang: 'tr'
            }
        });

        console.log('Weather API Response Status:', response.status);
        res.json(response.data);
    } catch (error) {
        console.error('Weather API Error Details:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message
        });
        
        res.status(500).json({ 
            error: 'Weather data fetch failed',
            details: error.response?.data || error.message 
        });
    }
});

// Geocoding endpoint - daha detaylı hata yönetimi
app.get('/api/geocode', async (req, res) => {
    try {
        const { lat, lng } = req.query;
        
        if (!lat || !lng) {
            return res.status(400).json({ 
                error: 'Latitude ve longitude parametreleri gerekli' 
            });
        }

        console.log(`Geocoding request for lat: ${lat}, lng: ${lng}`);
        
        const response = await axios.get(
            'https://api.opencagedata.com/geocode/v1/json',
            {
                params: {
                    q: `${lat}+${lng}`,
                    key: process.env.GEOCODE_API_KEY,
                    language: 'tr'
                }
            }
        );

        console.log('Geocoding response status:', response.status);
        res.json(response.data);
    } catch (error) {
        console.error('Geocoding Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Geocoding failed',
            details: error.response?.data || error.message 
        });
    }
});

// Currency conversion endpoint
app.get('/api/currency', async (req, res) => {
    try {
        const { from, to, amount } = req.query;
        const response = await axios.get(
            `https://api.exchangerate-api.com/v4/latest/${from}?apikey=${process.env.EXCHANGE_RATE_API_KEY}`
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Currency conversion failed' });
    }
});

// Countries endpoint - veri önbelleğe alma ve hata yönetimi iyileştirmesi
let cachedCountries = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 dakika
let lastFetch = 0;

app.get('/api/countries', async (req, res) => {
    try {
        const now = Date.now();
        if (cachedCountries && (now - lastFetch < CACHE_DURATION)) {
            console.info('📦 Önbellekten ülke verileri gönderiliyor');
            return res.json(cachedCountries);
        }

        console.info('🌐 Ülke verileri getiriliyor...');
        const response = await axios.get('https://restcountries.com/v3.1/all', {
            timeout: 5000
        });

        const processedData = response.data
            .filter(country => country && country.name && country.cca3)
            .map(country => ({
                name: {
                    common: country.name.common || '',
                    official: country.name.official || '',
                    nativeName: country.name.nativeName || {}
                },
                cca2: country.cca2,
                cca3: country.cca3,
                capital: Array.isArray(country.capital) ? country.capital : ['Bilinmiyor'],
                region: country.region || '',
                languages: country.languages || {},
                currencies: country.currencies || {},
                population: Number(country.population) || 0,
                flags: {
                    png: country.flags?.png || '',
                    svg: country.flags?.svg || ''
                },
                borders: Array.isArray(country.borders) ? country.borders : [],
                area: Number(country.area) || 0,
                timezones: Array.isArray(country.timezones) ? country.timezones : ['UTC'],
                latlng: Array.isArray(country.latlng) ? country.latlng : [0, 0],
                capitalInfo: country.capitalInfo || { latlng: [0, 0] },
                car: country.car || { signs: [], side: 'right' },
                idd: country.idd || { root: '', suffixes: [''] },
                tld: Array.isArray(country.tld) ? country.tld : ['.unknown']
            }))
            .sort((a, b) => a.name.common.localeCompare(b.name.common));

        cachedCountries = processedData;
        lastFetch = now;

        console.info(`✅ ${processedData.length} ülke işlendi`);
        return res.json(processedData);
    } catch (error) {
        console.error('❌ Ülke API Hatası:', error.message);
        
        if (cachedCountries) {
            console.info('⚠️ Yedek veriler kullanılıyor');
            return res.json(cachedCountries);
        }

        res.status(500).json({ 
            error: 'Ülke verileri alınamadı',
            details: error.message 
        });
    }
});

// Specific country endpoint - iyileştirilmiş veri işleme
app.get('/api/countries/name/:name', async (req, res) => {
    try {
        const name = req.params.name.toLowerCase();
        
        // Önce cache'den ara
        if (cachedCountries) {
            const country = cachedCountries.find(c => 
                c.name.common.toLowerCase() === name ||
                c.name.official.toLowerCase() === name
            );
            
            if (country) {
                return res.json([country]);
            }
        }

        const response = await axios.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}`, {
            timeout: 5000
        });

        if (response.data && Array.isArray(response.data) && response.data.length > 0) {
            return res.json(response.data);
        }

        throw new Error('Country not found');
    } catch (error) {
        console.error(`Error fetching country data:`, error.message);
        res.status(404).json({ error: 'Country not found' });
    }
});

// Codes endpoint - iyileştirilmiş hata yönetimi
app.get('/api/countries/codes/:codes', async (req, res) => {
    try {
        const codes = req.params.codes.split(',');
        
        // Önce cache'den ara
        if (cachedCountries) {
            const countries = cachedCountries.filter(c => codes.includes(c.cca3));
            if (countries.length === codes.length) {
                return res.json(countries);
            }
        }

        const response = await axios.get(`https://restcountries.com/v3.1/alpha?codes=${codes.join(',')}`, {
            timeout: 5000
        });

        if (response.data && Array.isArray(response.data)) {
            return res.json(response.data);
        }

        throw new Error('Countries not found');
    } catch (error) {
        console.error('Error fetching countries by codes:', error.message);
        res.status(404).json({ error: 'Countries not found' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
