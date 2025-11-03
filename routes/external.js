const express = require('express');
const axios = require('axios');
const router = express.Router();

/**
 * External API #1: YouTube Data API v3
 * Env: YT_API_KEY
 * GET /api/external/youtube?q=keyword
 */
router.get('/youtube', async (req, res) => {
  const key = process.env.YT_API_KEY || '';
  if (!key) return res.status(501).json({ error: 'YT_API_KEY not configured' });
  const { q = '' } = req.query;

  try {
    const resp = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: { key, q, part: 'snippet', type: 'video', maxResults: 6 }
    });
    const items = (resp.data.items || []).map(i => ({
      id: i?.id?.videoId,
      title: i?.snippet?.title,
      thumbnail: i?.snippet?.thumbnails?.medium?.url || i?.snippet?.thumbnails?.default?.url || null,
      source: 'youtube'
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * External API #2: TMDB search — supports v3 (api_key) or v4 (Bearer)
 * Env:
 *  - TMDB_API_KEY   (v3)  OR
 *  - TMDB_V4_TOKEN  (v4)
 * If both are provided, v4 takes precedence.
 * GET /api/external/tmdb/search?q=keyword
 */
router.get('/tmdb/search', async (req, res) => {
  const v3 = process.env.TMDB_API_KEY || '';
  const v4 = process.env.TMDB_V4_TOKEN || '';
  if (!v3 && !v4) return res.status(501).json({ error: 'TMDB_API_KEY or TMDB_V4_TOKEN not configured' });

  const { q = '' } = req.query;

  try {
    const url = 'https://api.themoviedb.org/3/search/movie';
    const baseParams = { query: q, include_adult: false, language: 'en-US', page: 1 };
    const params = v4 ? baseParams : { ...baseParams, api_key: v3 };
    const headers = v4 ? { Authorization: `Bearer ${v4}` } : {};

    const resp = await axios.get(url, { params, headers });
    const items = (resp.data.results || []).slice(0, 6).map(m => ({
      id: m.id,
      title: m.title,
      thumbnail: m.poster_path ? `https://image.tmdb.org/t/p/w342${m.poster_path}` : null,
      source: 'tmdb'
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * External API #3: Pixabay images
 * Env: PIXABAY_API_KEY
 * GET /api/external/pixabay/search?q=keyword
 */
router.get('/pixabay/search', async (req, res) => {
  const key = process.env.PIXABAY_API_KEY || '';
  if (!key) return res.status(501).json({ error: 'PIXABAY_API_KEY not configured' });
  const { q = '' } = req.query;

  try {
    const resp = await axios.get('https://pixabay.com/api/', {
      params: { key, q, image_type: 'photo', per_page: 6, safesearch: true }
    });
    const items = (resp.data.hits || []).map(h => ({
      id: h.id,
      title: h.tags,
      thumbnail: h.previewURL || h.webformatURL || null,
      source: 'pixabay'
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { externalRouter: router };