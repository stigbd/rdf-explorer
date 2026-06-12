import type { QueryType, SerializationFormat } from '@rdf-explorer/types';
import { CodeEditor, LoadingSpinner, PrefixesList, ResultsTable } from '@rdf-explorer/ui';
import type React from 'react';
import { useState } from 'react';
import {
  DEFAULT_QUERY,
  DEFAULT_SHACL_SHAPES,
  INITIAL_DATA,
  QUERY_TEMPLATES,
  SHACL_TEMPLATES,
} from '../constants/queries';
import { usePrefixes } from '../hooks/usePrefixes';
import { useSHACLValidation } from '../hooks/useSHACLValidation';
import { useSPARQLQuery } from '../hooks/useSPARQLQuery';

type ActiveTab = 'sparql' | 'shacl';

// Utility function to detect query type from query string
const detectQueryType = (query: string): QueryType => {
  const upperQuery = query.trim().toUpperCase();

  // Remove single-line comments, PREFIX declarations, and blank lines
  const cleaned = upperQuery
    .replace(/^\s*#.*$/gm, '')
    .replace(/PREFIX\s+\S+\s*<[^>]+>\s*/g, '')
    .trim();

  // Check CONSTRUCT and DESCRIBE first since they may contain SELECT in WHERE clause
  if (cleaned.startsWith('CONSTRUCT')) return 'construct';
  if (cleaned.startsWith('DESCRIBE')) return 'describe';
  if (cleaned.startsWith('ASK')) return 'ask';
  if (cleaned.startsWith('SELECT')) return 'select';
  return 'select'; // default
};

// Format options based on query type
const getAvailableFormats = (queryType: QueryType): SerializationFormat[] => {
  if (queryType === 'select' || queryType === 'ask') {
    return ['sparql-json', 'csv', 'sparql-xml'];
  }
  // describe or construct
  return ['turtle', 'json-ld', 'rdf-xml'];
};

// Get default format for query type
const getDefaultFormat = (queryType: QueryType): SerializationFormat => {
  if (queryType === 'select' || queryType === 'ask') {
    return 'sparql-json';
  }
  return 'turtle';
};

// Get display label for format
const getFormatLabel = (format: SerializationFormat): string => {
  switch (format) {
    case 'sparql-json':
      return 'SPARQL JSON';
    case 'csv':
      return 'CSV';
    case 'sparql-xml':
      return 'SPARQL XML';
    case 'turtle':
      return 'Turtle';
    case 'json-ld':
      return 'JSON-LD';
    case 'rdf-xml':
      return 'RDF/XML';
    default:
      return format;
  }
};

export const RDFExplorer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sparql');
  const [data, setData] = useState<string>(INITIAL_DATA);
  const [inference, setInference] = useState<boolean>(false);
  const [result, setResult] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [length, setLength] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // SPARQL state
  const [query, setQuery] = useState<string>(DEFAULT_QUERY);
  const [queryType, setQueryType] = useState<QueryType>('select');
  const [selectedFormat, setSelectedFormat] = useState<SerializationFormat>('sparql-json');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('select');

  // SHACL state
  const [shapes, setShapes] = useState<string>(DEFAULT_SHACL_SHAPES);

  // Fetch prefixes
  const { prefixes, isLoading: isPrefixesLoading, error: prefixesError } = usePrefixes();

  // Detect query type when query changes (but only when typing, not when using templates)
  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
    // Don't change the query type when the editor has no actual query body
    const bodyWithoutPrefixesAndComments = newQuery
      .replace(/^\s*#.*$/gm, '')
      .replace(/PREFIX\s+\S+\s*<[^>]+>\s*/gi, '')
      .trim();
    if (!bodyWithoutPrefixesAndComments) return;
    const detectedType = detectQueryType(newQuery);
    if (detectedType !== queryType) {
      setQueryType(detectedType);
      // Update template dropdown to the first template matching the detected type
      const matchingKey = Object.keys(QUERY_TEMPLATES).find(
        (key) => QUERY_TEMPLATES[key].type === detectedType,
      );
      if (matchingKey) setSelectedTemplate(matchingKey);
      const availableFormats = getAvailableFormats(detectedType);
      if (!availableFormats.includes(selectedFormat)) {
        setSelectedFormat(getDefaultFormat(detectedType));
      }
    }
  };

  const { executeQuery, isLoading: isSparqlLoading } = useSPARQLQuery({
    onSuccess: (data, executionDuration, resultLength) => {
      setResult(data);
      setDuration(executionDuration);
      setLength(resultLength);
      setErrorMessage('');
    },
    onError: (error) => {
      setErrorMessage(error.detail || error.message);
      setResult('');
    },
  });

  const { validateSHACL, isLoading: isShaclLoading } = useSHACLValidation({
    onSuccess: (data, executionDuration, resultLength) => {
      setResult(data);
      setDuration(executionDuration);
      setLength(resultLength);
      setErrorMessage('');
    },
    onError: (error) => {
      setErrorMessage(error.detail || error.message);
      setResult('');
    },
  });

  const isLoading = isSparqlLoading || isShaclLoading;

  const handleExecuteQuery = () => {
    if (!query.trim() || !data.trim()) {
      setErrorMessage('Both query and data are required');
      return;
    }

    executeQuery({
      request: { query, data, inference },
      format: selectedFormat,
    });
  };

  const handleExecuteValidation = () => {
    if (!shapes.trim() || !data.trim()) {
      setErrorMessage('Both shapes and data are required');
      return;
    }

    validateSHACL({
      data,
      shapes,
      inference,
    });
  };

  const handleTemplateChange = (templateKey: string) => {
    const template = QUERY_TEMPLATES[templateKey];
    if (template) {
      const newFormat = getDefaultFormat(template.type);
      setSelectedTemplate(templateKey);
      setQueryType(template.type);
      setSelectedFormat(newFormat);
      setQuery(template.query);
    }
  };

  const handleShapeTemplateChange = (templateKey: string) => {
    const template = SHACL_TEMPLATES[templateKey];
    if (template) {
      setShapes(template.shapes);
    }
  };

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    // Clear results when switching tabs
    setResult('');
    setDuration(0);
    setLength(0);
    setErrorMessage('');
  };

  return (
    <div className="rdf-explorer">
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background-color: #f8fafc;
        }

        .rdf-explorer {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px;
        }

        .header {
          margin-bottom: 32px;
          text-align: center;
        }

        .header h1 {
          font-size: 32px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .header p {
          color: #64748b;
          font-size: 16px;
        }

        .tabs {
          display: flex;
          gap: 8px;
          margin-bottom: 24px;
          border-bottom: 2px solid #e2e8f0;
        }

        .tab {
          padding: 12px 24px;
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          color: #64748b;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: -2px;
        }

        .tab:hover {
          color: #475569;
          background-color: #f8fafc;
        }

        .tab.active {
          color: #3b82f6;
          border-bottom-color: #3b82f6;
        }

        .controls {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
          align-items: center;
          flex-wrap: wrap;
        }

        .control-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .control-group label {
          font-weight: 600;
          color: #475569;
          font-size: 14px;
          cursor: pointer;
          user-select: none;
        }

        .control-group input[type="checkbox"] {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #3b82f6;
          margin-right: 8px;
        }

        .select {
          padding: 8px 32px 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background-color: white;
          color: #1e293b;
          font-size: 14px;
          cursor: pointer;
          outline: none;
          transition: border-color 0.2s;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23475569' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
        }

        .select:hover {
          border-color: #cbd5e1;
        }

        .select:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .button {
          padding: 10px 24px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .button-primary {
          background-color: #3b82f6;
          color: white;
        }

        .button-primary:hover:not(:disabled) {
          background-color: #2563eb;
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .button-primary:disabled {
          background-color: #94a3b8;
          cursor: not-allowed;
        }

        .editors-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }

        .rdf-section {
          display: flex;
          gap: 16px;
          position: relative;
        }

        .rdf-editor-wrapper {
          flex: 1;
          min-width: 0;
          transition: all 0.3s ease-out;
        }

        @media (max-width: 1400px) {
          .rdf-section {
            flex-direction: column;
          }
        }

        @media (max-width: 1024px) {
          .editors-container {
            grid-template-columns: 1fr;
          }
        }

        .editor-panel {
          background: white;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
        }

        .editor-panel h2 {
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .editor-hint {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 12px;
          font-style: italic;
        }

        .results-section {
          background: white;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
        }

        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .results-header h2 {
          font-size: 20px;
          font-weight: 600;
          color: #1e293b;
        }

        .execution-time {
          font-size: 14px;
          color: #64748b;
          font-weight: 500;
        }

        .error-banner {
          background-color: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          padding: 16px;
          margin-bottom: 24px;
          color: #991b1b;
        }

        .error-banner h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .error-banner p {
          font-size: 14px;
          line-height: 1.5;
        }

        .empty-state {
          text-align: center;
          padding: 64px 24px;
          color: #64748b;
        }

        .empty-state-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #475569;
        }

        .empty-state p {
          font-size: 14px;
        }
      `}</style>

      <div className="header">
        <h1>
          <span>
            <img src="rdf_w3c_icon_48.gif" alt="Icon" />
          </span>
          RDF Explorer
        </h1>
        <p>Execute SPARQL queries and validate RDF data with SHACL shapes</p>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'sparql' ? 'active' : ''}`}
          onClick={() => handleTabChange('sparql')}
        >
          🔍 SPARQL Query
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'shacl' ? 'active' : ''}`}
          onClick={() => handleTabChange('shacl')}
        >
          ✓ SHACL Validation
        </button>
      </div>

      {activeTab === 'sparql' && (
        <div className="controls">
          <div className="control-group">
            <label htmlFor="query-template">Query Template:</label>
            <select
              id="query-template"
              className="select"
              value={selectedTemplate}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              {Object.entries(QUERY_TEMPLATES).map(([key, template]) => (
                <option key={key} value={key}>
                  {template.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="result-format">Result Format:</label>
            <select
              id="result-format"
              className="select"
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value as SerializationFormat)}
            >
              {getAvailableFormats(queryType).map((format) => (
                <option key={format} value={format}>
                  {getFormatLabel(format)}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="inference-toggle">Enable Inference</label>
            <input
              type="checkbox"
              id="inference-toggle"
              checked={inference}
              onChange={(e) => setInference(e.target.checked)}
            />
          </div>
        </div>
      )}

      {activeTab === 'shacl' && (
        <div className="controls">
          <div className="control-group">
            <label htmlFor="shape-template">Shape Template:</label>
            <select
              id="shape-template"
              className="select"
              onChange={(e) => handleShapeTemplateChange(e.target.value)}
              defaultValue="basic"
            >
              {Object.entries(SHACL_TEMPLATES).map(([key, template]) => (
                <option key={key} value={key}>
                  {template.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="inference-toggle-shacl">Enable Inference</label>
            <input
              type="checkbox"
              id="inference-toggle-shacl"
              checked={inference}
              onChange={(e) => setInference(e.target.checked)}
            />
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="error-banner">
          <h3>❌ Error</h3>
          <p>{errorMessage}</p>
        </div>
      )}

      <div className="editors-container">
        <div className="editor-panel">
          {activeTab === 'sparql' && (
            <>
              <h2>🔍 SPARQL Query</h2>
              <p className="editor-hint">Enter your SPARQL query below</p>
              <CodeEditor
                value={query}
                onChange={handleQueryChange}
                language="sparql"
                placeholder="Enter your SPARQL query here..."
                minHeight="400px"
              />
              <div style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleExecuteQuery}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span>⏳</span>
                      Executing...
                    </>
                  ) : (
                    <>
                      <span>▶️</span>
                      Execute Query
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {activeTab === 'shacl' && (
            <>
              <h2>📐 SHACL Shapes</h2>
              <p className="editor-hint">Define SHACL shapes to validate your RDF data</p>
              <CodeEditor
                value={shapes}
                onChange={setShapes}
                language="turtle"
                placeholder="Enter your SHACL shapes here..."
                minHeight="400px"
              />
              <div style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleExecuteValidation}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span>⏳</span>
                      Validating...
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      Validate Data
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="rdf-section">
          <div className="rdf-editor-wrapper">
            <div className="editor-panel">
              <h2>📝 RDF Data</h2>
              <p className="editor-hint">Enter your RDF data in Turtle format</p>
              <CodeEditor
                value={data}
                onChange={setData}
                language="turtle"
                placeholder="Enter your RDF data here..."
                minHeight="400px"
              />
            </div>
          </div>

          <PrefixesList
            prefixes={prefixes}
            isLoading={isPrefixesLoading}
            error={prefixesError || undefined}
          />
        </div>
      </div>

      <div className="results-section">
        <div className="results-header">
          <h2>Results</h2>
          {duration > 0 && (
            <span className="execution-time">
              {activeTab === 'sparql'
                ? `${length} ${length === 1 ? 'result' : 'results'}`
                : `${length} ${length === 1 ? 'triple' : 'triples'}`}{' '}
              in {duration.toFixed(3)}s
            </span>
          )}
        </div>

        {isLoading && <LoadingSpinner size="large" />}

        {!isLoading && !result && !errorMessage && (
          <div className="empty-state">
            <div className="empty-state-icon">🎯</div>
            <h3>Ready to {activeTab === 'sparql' ? 'execute' : 'validate'}</h3>
            <p>
              {activeTab === 'sparql'
                ? 'Enter your query and data, then click "Execute Query" to see results'
                : 'Enter your shapes and data, then click "Validate Data" to see validation results'}
            </p>
          </div>
        )}

        {!isLoading && result && activeTab === 'sparql' && (
          <ResultsTable data={result} format={selectedFormat} />
        )}

        {!isLoading && result && activeTab === 'shacl' && (
          <CodeEditor value={result} onChange={() => {}} language="turtle" minHeight="300px" />
        )}
      </div>
    </div>
  );
};

export default RDFExplorer;
