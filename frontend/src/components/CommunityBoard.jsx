import { useState, useEffect } from 'react';
import { getCommunityPosts, createCommunityPost, deleteCommunityPost } from '../api';

const CATEGORIES = ['all', 'safety', 'lost_pet', 'wildlife', 'infrastructure', 'hoa_notice', 'general'];

const CATEGORY_LABELS = {
  all:            'All',
  safety:         'Safety',
  lost_pet:       'Lost Pet',
  wildlife:       'Wildlife',
  infrastructure: 'Infrastructure',
  hoa_notice:     'HOA Notice',
  general:        'General',
};

const CATEGORY_STYLES = {
  safety:         'bg-red-100 text-red-700',
  lost_pet:       'bg-orange-100 text-orange-700',
  wildlife:       'bg-yellow-100 text-yellow-800',
  infrastructure: 'bg-purple-100 text-purple-700',
  hoa_notice:     'bg-blue-100 text-blue-700',
  general:        'bg-gray-100 text-gray-600',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CommunityBoard({ currentUserEmail, isAdmin, onViewed }) {
  const [posts,       setPosts]      = useState([]);
  const [catFilter,   setCatFilter]  = useState('all');
  const [showForm,    setShowForm]   = useState(false);
  const [submitting,  setSubmitting] = useState(false);
  const [loading,     setLoading]    = useState(true);

  // Form state
  const [title,    setTitle]    = useState('');
  const [body,     setBody]     = useState('');
  const [category, setCategory] = useState('general');
  const [image,    setImage]    = useState(null);

  useEffect(() => {
    setLoading(true);
    getCommunityPosts(catFilter)
      .then(posts => {
        setPosts(posts);
        // Mark community as seen — update localStorage and notify parent to clear dot
        localStorage.setItem('community_last_seen', new Date().toISOString());
        onViewed?.();
      })
      .catch(err => alert('Failed to load posts: ' + err.message))
      .finally(() => setLoading(false));
  }, [catFilter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('title',    title.trim());
      form.append('body',     body.trim());
      form.append('category', category);
      if (image) form.append('image', image);

      const post = await createCommunityPost(form);
      setPosts(prev => [post, ...prev]);
      setTitle(''); setBody(''); setCategory('general'); setImage(null);
      setShowForm(false);
    } catch (err) {
      alert('Failed to post: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (postId) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteCommunityPost(postId);
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filter pills + New Post button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCatFilter(c)}
              className={`px-3 py-1 text-xs font-semibold rounded-full transition ${
                catFilter === c
                  ? 'bg-blue-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 text-sm font-semibold bg-blue-900 text-white rounded-lg hover:bg-blue-800 transition flex-shrink-0"
        >
          {showForm ? 'Cancel' : '+ New Post'}
        </button>
      </div>

      {/* Compose form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">New Announcement</h3>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={255}
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {CATEGORIES.filter(c => c !== 'all').map(c => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <textarea
            placeholder="Describe the situation..."
            value={body}
            onChange={e => setBody(e.target.value)}
            required
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          />
          <div>
            <label className="text-xs text-gray-500 block mb-1">Photo (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setImage(e.target.files[0] || null)}
              className="text-sm text-gray-600"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
          >
            {submitting ? 'Posting...' : 'Post Announcement'}
          </button>
        </form>
      )}

      {/* Feed */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No posts yet — be the first to post!</p>
      ) : (
        <div className="space-y-3">
          {posts.map(post => (
            <div key={post.id} className="bg-white border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${CATEGORY_STYLES[post.category]}`}>
                    {CATEGORY_LABELS[post.category]}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{post.author_name}</span>
                  <span className="text-xs text-gray-400">
                    · {post.author_role === 'admin' ? 'HOA Admin' : 'Resident'}
                  </span>
                  <span className="text-xs text-gray-400">· {timeAgo(post.created_at)}</span>
                </div>
                {(post.author_email === currentUserEmail || isAdmin) && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="text-xs text-gray-400 hover:text-red-500 transition flex-shrink-0"
                    title="Delete post"
                  >
                    ✕
                  </button>
                )}
              </div>
              <h4 className="mt-2 font-semibold text-gray-900">{post.title}</h4>
              <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{post.body}</p>
              {post.image_url && (
                <img
                  src={post.image_url}
                  alt="Post photo"
                  className="mt-3 rounded-lg border max-h-64 object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
