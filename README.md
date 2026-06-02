<h1 align="center">Notebook LLM Architecture and Documentation</h1>

<h2>System Architecture</h2>
<pre><code>
=============================================================================
                          NOTEBOOK LLM ARCHITECTURE
=============================================================================

+---------------------------------------------------------------------------+
|                              FRONTEND (Vite / React / TS)                 |
|                                                                           |
|  +-----------------+  +-------------------+  +-------------------------+  |
|  | Document Reader |  |  Library Manager  |  |     App Tools & UI      |  |
|  | - PDF Surface   |  | - Spatial Canvas  |  | - Marquee Selector      |  |
|  | - ePub Surface  |  | - Mind Map        |  | - Archive Cards         |  |
|  | - Text Surface  |  | - Echo Dashboard  |  | - Notifications         |  |
|  +--------+--------+  +---------+---------+  +-------------------------+  |
|           |                     |                                         |
+-----------|---------------------|-----------------------------------------+
            | HTTP / REST / WebSockets (Inferred)
+-----------|---------------------|-----------------------------------------+
|                               BACKEND (Python)                            |
|                                                                           |
|  +---------------------------------------------------------------------+  |
|  |                            API Routing                              |  |
|  |                            (api.py)                                 |  |
|  +---------------------------------------------------------------------+  |
|                                                                           |
|  +--------------------+  +--------------------+  +---------------------+  |
|  | Ingestion Pipeline |  | Processing Engines |  | Data & Storage Mgt  |  |
|  | - ingestor.py      |  | - reasoning.py     |  | - db_manager.py     |  |
|  | - ingest_queue.py  |  | - graph_engine.py  |  | - library_registry  |  |
|  | - chunker.py       |  | - echo_engine.py   |  | - vectorize.py      |  |
|  +--------------------+  +--------------------+  +---------------------+  |
+---------------------------------------------------------------------------+
</code></pre>

<h2>Overview</h2>
<p>Notebook LLM is a full-stack workspace application integrating document reading, spatial knowledge management, and AI-driven processing capabilities.<!--[cite: 3] --> It utilizes a React and TypeScript frontend for rendering rich text and spatial interfaces, supported by a Python backend for chunking, vectorization, and LLM orchestration.<!--[cite: 3] --></p>

<h2>1. Frontend Architecture</h2>
<p>The frontend is a single-page application built with React and TypeScript, bundled via Vite (<code>vite.config.js</code>, <code>tsconfig.json</code>).<!--[cite: 3] --></p>

<h3>Core Modules</h3>
<ul>
  <li><strong>Reader System (<code>src/components/reader/</code>):</strong> Dedicated surfaces for reading diverse formats (<code>PlayBooksEpubSurface.tsx</code>, <code>PlayBooksPdfSurface.tsx</code>, <code>PlayBooksTextSurface.tsx</code>).<!--[cite: 3] --> Managed by format-specific hooks (<code>usePdfControl.tsx</code>, <code>useEpubControl.tsx</code>).<!--[cite: 3] --></li>
  <li><strong>Library & Knowledge Management (<code>src/components/libraryManager/</code>):</strong>
    <ul>
      <li><strong>Spatial Canvas:</strong> Visual workspace mapping interface (<code>SpatialStack.tsx</code>, <code>PrimaryViewerCard.tsx</code>, <code>ScrubRuler.tsx</code>).<!--[cite: 3] --></li>
      <li><strong>Mind Map & The Brain:</strong> Visual knowledge graphing tools (<code>mindMapUI.tsx</code>, <code>theBrainUI.tsx</code>).<!--[cite: 3] --></li>
      <li><strong>Echo Dashboard:</strong> Analytics and review dashboard (<code>echoDashboardUI.tsx</code>) with interactive elements (<code>DraftBranchColumn.tsx</code>, <code>ExpandableChunkCard.tsx</code>).<!--[cite: 3] --></li>
    </ul>
  </li>
  <li><strong>State Management (<code>src/hooks/</code>):</strong> Custom hooks govern application logic, such as <code>useCanvasData.ts</code> (spatial rendering), <code>useNotesSectionState.ts</code> (note-taking), and <code>useAppActions.tsx</code> (state dispatching).<!--[cite: 3] --></li>
</ul>

<h2>2. Backend Architecture</h2>
<p>The backend is a Python service environment orchestrating data ingestion, vectorization, and intelligence processing (<code>requirements.txt</code>, <code>scripts/</code>).<!--[cite: 3] --></p>

<h3>Core Engines</h3>
<ul>
  <li><strong>API Interface:</strong> External communication routing (<code>api.py</code>).<!--[cite: 3] --></li>
  <li><strong>Ingestion Pipeline:</strong> Asynchronous document processing (<code>ingest_queue.py</code>, <code>ingestor.py</code>), chunking (<code>chunker.py</code>), and embedding (<code>vectorize.py</code>, <code>vectorize_registry.py</code>).<!--[cite: 3] --></li>
  <li><strong>Intelligence Layer:</strong>
    <ul>
      <li><strong>Graph Engine:</strong> Entity relationship mapping (<code>graph_engine.py</code>).<!--[cite: 3] --></li>
      <li><strong>Reasoning:</strong> LLM prompt orchestration and logical deductions (<code>reasoning.py</code>).<!--[cite: 3] --></li>
      <li><strong>Analysis:</strong> Deep analytics on text (<code>analysis_engine.py</code>).<!--[cite: 3] --></li>
    </ul>
  </li>
  <li><strong>Storage:</strong> Database operations (<code>db_manager.py</code>) with maintenance scripts (<code>library_maintenance.py</code>, <code>reset_db.py</code>).<!--[cite: 3] --></li>
</ul>

<h2>3. Infrastructure & Deployment</h2>
<ul>
  <li><strong>Containerization:</strong> The repository supports Docker deployments (<code>Dockerfile</code>, <code>start.sh</code>).<!--[cite: 3] --></li>
  <li><strong>Frontend Hosting:</strong> Pre-configured for Vercel deployment (<code>vercel.json</code>).<!--[cite: 3] --></li>
  <li><strong>Model Integration:</strong> Scripts for Hugging Face Spaces integration (<code>manage_hf_space.py</code>).<!--[cite: 3] --></li>
</ul>

<h2></h2>
<ul>

</ul>


<video 
  width="1433" height="991" alt="video" src="https://github.com/user-attachments/assets/a7cb8a38-2a9f-48cc-bf8a-ba0ccea446eb" controls width="700">
  </video>
<img width="1433" height="991" alt="image" src="https://github.com/user-attachments/assets/9a07bf5e-438d-4c39-a889-401e6d5aea92" />
<img width="1429" height="990" alt="image" src="https://github.com/user-attachments/assets/9a37b469-a856-4aeb-84eb-e24f071656eb" />
<img width="1431" height="994" alt="image" src="https://github.com/user-attachments/assets/5686e112-10b5-4b26-9404-8156b8a515a4" />
<img width="1423" height="986" alt="image" src="https://github.com/user-attachments/assets/fb8be737-e76a-4ec3-bd76-4ad4f0bbe89c" />
<img width="1433" height="993" alt="image" src="https://github.com/user-attachments/assets/605ed4fc-30d8-47af-b8b3-a24fb8c3d3c7" />
<img width="1428" height="994" alt="image" src="https://github.com/user-attachments/assets/750b18d3-49f2-40f8-8f75-dc66c3af645e" />
<img width="1434" height="995" alt="image" src="https://github.com/user-attachments/assets/dff3e493-5c59-4b97-939d-64b1c8ffc5a9" />

