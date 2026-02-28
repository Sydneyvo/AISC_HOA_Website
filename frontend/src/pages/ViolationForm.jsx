import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { analyzeViolation, submitViolation } from '../api';

const CATEGORIES = ['parking', 'garbage', 'lawn', 'exterior', 'structure', 'other'];
const SEVERITIES = ['low', 'medium', 'high'];

const SEVERITY_STYLES = {
  low:    'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  high:   'bg-red-100 text-red-800 border-red-300',
};

// ─── State B: the review + edit form shown after AI analysis ─────────────────

function ReviewForm({ analysis, imageUrl, propertyId, navigate }) {
  const [form, setForm] = useState({
    category:      analysis.category     || 'other',
    severity:      analysis.severity     || 'low',
    description:   analysis.description  || '',
    rule_cited:    analysis.rule_cited   || '',
    remediation:   analysis.remediation  || '',
    deadline_days: analysis.deadline_days ?? 14,
  });
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (sendEmail) => {
    if (!form.description.trim()) {
      alert('Please fill in a description before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      await submitViolation({
        property_id:   parseInt(propertyId),
        image_url:     imageUrl,
        send_email:    sendEmail,
        ...form,
        deadline_days: parseInt(form.deadline_days),
      });
      navigate(`/properties/${propertyId}`);
    } catch (e) {
      alert('Submit failed: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-blue-900">Review & Edit Notice</h1>
        <Link to={`/properties/${propertyId}`} className="text-sm text-gray-400 hover:underline">
          Cancel
        </Link>
      </div>

      {!analysis.violation_detected && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-4 text-sm">
          The AI did not detect a clear violation. You can still file a manual report below.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8">

        {/* Left: photo */}
        <div>
          <img
            src={imageUrl}
            alt="Violation"
            className="rounded-xl border w-full object-cover max-h-80"
          />
          <p className="text-xs text-gray-400 mt-2 text-center">Uploaded to Azure Blob Storage</p>
        </div>

        {/* Right: editable form */}
        <div className="space-y-5">

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={form.category}
              onChange={update('category')}
            >
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
            <div className="flex gap-2">
              {SEVERITIES.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, severity: s }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition ${
                    form.severity === s
                      ? SEVERITY_STYLES[s]
                      : 'border-gray-200 text-gray-400 hover:border-gray-300'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Text fields */}
          {[
            { field: 'description',  label: 'Description',       rows: 3 },
            { field: 'rule_cited',   label: 'Rule Cited',         rows: 2 },
            { field: 'remediation',  label: 'Remediation Steps',  rows: 3 },
          ].map(({ field, label, rows }) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                rows={rows}
                value={form[field]}
                onChange={update(field)}
              />
            </div>
          ))}

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deadline (days to resolve)
            </label>
            <input
              type="number"
              min="1"
              max="90"
              className="border rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={form.deadline_days}
              onChange={update('deadline_days')}
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => handleSubmit(true)}
              disabled={submitting}
              className="flex-1 bg-blue-700 text-white py-3 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50 transition"
            >
              {submitting ? 'Sending...' : 'Send Notice & Save'}
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={submitting}
              className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 disabled:opacity-50 transition"
            >
              Save Without Sending
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── State A: upload zone ─────────────────────────────────────────────────────

export default function ViolationForm() {
  const { id: propertyId } = useParams();
  const navigate           = useNavigate();

  const [file, setFile]         = useState(null);
  const [preview, setPreview]   = useState(null);
  const [hint, setHint]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [imageUrl, setImageUrl] = useState('');

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleAnalyze = async () => {
    if (!file) return alert('Please select a photo first.');
    setLoading(true);
    try {
      const result = await analyzeViolation(file, propertyId, hint);
      setImageUrl(result.image_url);
      setAnalysis(result);
    } catch (e) {
      alert('Analysis failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Switch to State B once analysis returns
  if (analysis) {
    return (
      <ReviewForm
        analysis={analysis}
        imageUrl={imageUrl}
        propertyId={propertyId}
        navigate={navigate}
      />
    );
  }

  return (
    <div className="max-w-xl mx-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-blue-900">Report Violation</h1>
        <Link to={`/properties/${propertyId}`} className="text-sm text-gray-400 hover:underline">
          Cancel
        </Link>
      </div>

      {/* Drop zone */}
      <label
        className="block border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 transition"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        {preview ? (
          <img src={preview} className="mx-auto max-h-56 rounded-lg object-cover" alt="preview" />
        ) : (
          <div>
            <p className="text-4xl mb-3">📷</p>
            <p className="text-gray-500 font-medium">Click to upload or drag & drop</p>
            <p className="text-sm text-gray-400 mt-1">JPG, PNG supported</p>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
      </label>

      {preview && (
        <button
          onClick={() => { setFile(null); setPreview(null); }}
          className="mt-2 text-sm text-gray-400 hover:text-red-500 w-full text-center"
        >
          Remove photo
        </button>
      )}

      {/* Optional hint */}
      <div className="mt-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Hint for AI <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          rows={2}
          placeholder='e.g. "trash bins visible from street"'
          value={hint}
          onChange={e => setHint(e.target.value)}
        />
      </div>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!file || loading}
        className="mt-5 w-full bg-blue-700 text-white py-3.5 rounded-lg font-semibold hover:bg-blue-800 disabled:opacity-50 transition"
      >
        {loading ? 'Analyzing...' : 'Analyze Photo with AI'}
      </button>

      {loading && (
        <p className="mt-3 text-center text-sm text-gray-400 animate-pulse">
          Claude is reviewing the photo... (3–8 seconds)
        </p>
      )}
    </div>
  );
}
