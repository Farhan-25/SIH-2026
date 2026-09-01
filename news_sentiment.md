# Product Requirements Document (PRD)

## Maritime Market Intelligence & Geopolitical Risk Engine

**Version:** 1.0
**Status:** MVP Specification
**Product Area:** Intelligent Freight Forecasting & Vessel Chartering
**Primary Users:** Freight analysts, vessel chartering teams, procurement teams, logistics planners

---

# 1. Product Overview

The **Maritime Market Intelligence & Geopolitical Risk Engine** is an NLP-powered intelligence module that continuously monitors maritime news and geopolitical developments, extracts relevant shipping events, evaluates market sentiment, detects disruptions around major maritime chokepoints, and converts these signals into quantitative risk indicators.

The system will transform unstructured information such as:

* Shipping news
* Geopolitical developments
* Port disruptions
* Chokepoint incidents
* Vessel diversions
* Sanctions
* Weather disruptions
* Security incidents

into structured signals that can be incorporated into the project's **freight-rate forecasting and vessel chartering decision engine**.

### Core Pipeline

```text
Maritime News
      ↓
News Collection
      ↓
Text Processing
      ↓
FinBERT Sentiment Analysis
      ↓
Event & Entity Detection
      ↓
Chokepoint Detection
      ↓
News Volume / Anomaly Detection
      ↓
Geopolitical Risk Score
      ↓
Freight Forecasting Model
      ↓
Chartering / Procurement Decision Support
```

---

# 2. Problem Statement

Freight markets can react rapidly to geopolitical events and maritime disruptions.

Traditional freight forecasting models primarily rely on historical market data, vessel availability, cargo demand, bunker prices, and other quantitative variables.

However, major market shocks can originate from events that first appear in **unstructured textual information**.

Examples include:

* Red Sea attacks
* Suez Canal disruptions
* Malacca Strait incidents
* Port strikes
* Sanctions
* War-related restrictions
* Vessel diversions
* Extreme weather
* Insurance-related developments

These events can affect:

* Voyage duration
* Vessel availability
* Bunker consumption
* Insurance premiums
* Effective vessel supply
* Freight rates
* Chartering decisions

The proposed system will provide an automated mechanism to detect these signals and incorporate them into freight-market intelligence.

---

# 3. Goals

## Primary Goals

### G1 — Automated Maritime News Monitoring

Continuously collect relevant shipping and geopolitical news from permitted/publicly accessible sources.

### G2 — Maritime Sentiment Analysis

Use FinBERT to classify news as:

* Positive
* Neutral
* Negative

and generate a numerical sentiment score.

### G3 — Event Detection

Identify events relevant to maritime transportation.

Examples:

```text
Security attack
Port closure
Port congestion
Vessel diversion
Canal disruption
Strike
Sanctions
War
Weather disruption
Infrastructure failure
```

### G4 — Chokepoint Monitoring

Monitor major maritime chokepoints including:

* Red Sea / Bab el-Mandeb
* Suez Canal
* Strait of Malacca

The architecture should allow additional chokepoints to be added later.

### G5 — Geopolitical Risk Quantification

Convert qualitative news information into a numerical **Maritime Disruption Risk Index**.

### G6 — Freight Forecast Integration

Expose NLP-derived features to the existing freight forecasting model.

### G7 — Real-Time Alerts

Generate alerts when significant maritime disruptions or unusual increases in relevant news activity are detected.

---

# 4. Non-Goals

The MVP will **not** attempt to:

* Predict geopolitical events before they happen.
* Guarantee future freight rates.
* Automatically execute vessel charter contracts.
* Replace human chartering decisions.
* Scrape paywalled content without authorization.
* Treat sentiment as a direct probability of freight-rate movement.
* Build a general-purpose news recommendation system.

The system is a **decision-support tool**, not an autonomous chartering system.

---

# 5. Target Users

## 5.1 Freight Analyst

Needs to understand:

* Current market sentiment
* Emerging disruptions
* Geographic risk
* Potential freight-rate pressure

## 5.2 Chartering Manager

Needs early warnings about:

* Route disruptions
* Vessel diversions
* Transit-time increases
* Supply constraints

## 5.3 Procurement Manager

Needs to understand whether geopolitical developments could increase the cost of importing bulk cargo.

## 5.4 System / Data Scientist

Needs structured NLP features that can be consumed by forecasting models.

---

# 6. Functional Requirements

## FR-01 — News Collection

The system shall collect maritime news from configured sources.

Each article should contain, where available:

```text
Article ID
Headline
Description
Source
URL
Publication timestamp
Raw text
Collection timestamp
```

### Initial sources

The architecture should support sources such as:

* GDELT
* Public RSS feeds
* Public maritime news feeds
* Licensed APIs / data feeds where available

Premium sources such as TradeWinds, Baltic Exchange or S&P Global/Platts should only be integrated where the project has appropriate access.

---

# 7. News Filtering

Not every article collected should enter the NLP pipeline.

The system shall filter articles using maritime and geopolitical relevance.

### Example keywords

```text
shipping
vessel
bulk carrier
tanker
freight
charter
cargo
port
Suez
Red Sea
Bab el-Mandeb
Malacca
sanctions
war
strike
congestion
diversion
canal
piracy
attack
```

A relevance score may be generated:

```text
0.00 – 0.30    Low relevance
0.30 – 0.60    Moderate
0.60 – 1.00    High
```

Only articles above a configurable threshold should enter expensive NLP processing.

---

# 8. FR-03 — Text Preprocessing

The system shall clean incoming articles before NLP processing.

Processing includes:

```text
HTML removal
Whitespace normalization
Duplicate removal
Encoding normalization
Headline/body extraction
Sentence segmentation
```

The system should also identify duplicate or near-duplicate articles syndicated across multiple sources.

---

# 9. FR-04 — Sentiment Analysis

The system shall use **FinBERT** as the initial sentiment model.

### Output

For each article:

```json
{
  "sentiment": "negative",
  "positive_probability": 0.03,
  "neutral_probability": 0.08,
  "negative_probability": 0.89,
  "sentiment_score": -0.89
}
```

### Sentiment Score

The MVP will use:

```text
Positive → +P
Neutral  →  0
Negative → -P
```

Where `P` is the model confidence.

Therefore:

```text
Positive 0.91 → +0.91
Neutral  0.75 →  0.00
Negative 0.87 → -0.87
```

---

# 10. FR-05 — Event Detection

The system shall classify articles into predefined maritime event categories.

### Initial taxonomy

```text
SECURITY_ATTACK
WAR_CONFLICT
PIRACY
PORT_CLOSURE
PORT_CONGESTION
CANAL_DISRUPTION
VESSEL_DIVERSION
STRIKE
SANCTIONS
WEATHER
INFRASTRUCTURE_FAILURE
INSURANCE_RISK
OTHER
```

Each event shall have:

```text
Event type
Event confidence
Severity
Timestamp
Affected region
```

---

# 11. FR-06 — Entity & Location Detection

The system shall identify important entities and geographic locations.

### Example

Input:

> Several bulk carriers are diverting around the Cape of Good Hope following attacks near the Red Sea.

Output:

```json
{
  "ship_type": ["bulk carrier"],
  "location": ["Red Sea"],
  "event": ["vessel diversion"],
  "alternative_route": ["Cape of Good Hope"]
}
```

The architecture should allow future extraction of:

* Countries
* Ports
* Vessels
* Shipping companies
* Chokepoints
* Cargo types
* Routes

---

# 12. FR-07 — Chokepoint Detection

The system shall map detected events to monitored maritime chokepoints.

### MVP chokepoints

| Chokepoint     | Related Terms                 |
| -------------- | ----------------------------- |
| Red Sea        | Red Sea, Bab el-Mandeb, Yemen |
| Suez Canal     | Suez, Suez Canal              |
| Malacca Strait | Malacca, Strait of Malacca    |

### Example

```text
Article:

"Container vessels are avoiding the Suez Canal
following increased security risks in the Red Sea."

Detected:

Region:
Red Sea

Chokepoint:
Suez Canal

Event:
Vessel Diversion

Severity:
High
```

---

# 13. FR-08 — News Volume Monitoring

The system shall calculate the number of relevant articles associated with each region/chokepoint over time.

Example:

```text
Red Sea

Historical average:
8 articles/day

Current:
42 articles/day

Increase:
+425%
```

The system should identify unusual increases using a statistical anomaly measure such as a z-score.

```text
Z < 1       Normal
1–2         Elevated
2–3         High
>3          Extreme
```

Thresholds should be configurable.

---

# 14. FR-09 — Maritime Disruption Risk Index

The system shall generate a normalized risk score between:

```text
0.00 – 1.00
```

The MVP risk model may combine:

```text
Event Severity
News Volume Anomaly
Negative Sentiment
Recency
```

Initial weighting:

```text
Risk Score =

0.35 × Event Severity
+
0.25 × News Volume Anomaly
+
0.20 × Negative Sentiment
+
0.20 × Recency
```

All inputs must first be normalized to `[0,1]`.

### Example

```text
Event severity      = 0.90
News volume         = 0.85
Negative sentiment  = 0.80
Recency             = 0.95

Risk = 0.8825
```

Display:

```text
Red Sea Risk Index

0.88
HIGH
```

The score represents a **relative disruption-risk indicator**, not an 88% probability of disruption.

---

# 15. FR-10 — Risk Levels

The dashboard shall translate numerical risk into understandable categories.

```text
0.00 – 0.25    LOW
0.25 – 0.50    MODERATE
0.50 – 0.75    HIGH
0.75 – 1.00    CRITICAL
```

These thresholds should be configurable after validation against historical events.

---

# 16. FR-11 — Geopolitical Shock Detection

The system shall identify sudden changes in maritime information activity.

A shock may be triggered when multiple conditions occur simultaneously:

```text
High news-volume anomaly
        AND
High event severity
        AND/OR
Strong negative sentiment
```

Example:

```text
 MARITIME SHOCK DETECTED

Region: Red Sea

News volume: +285%
Sentiment: -0.84
Event severity: 0.91
Risk Index: 0.87

Primary event:
Security / Transit Disruption
```

---

# 17. FR-12 — Alert Generation

The system shall generate alerts for:

### Critical Risk

```text
Risk > 0.75
```

### News Surge

```text
News volume > configurable threshold
```

### Major Event

```text
Event severity > configurable threshold
```

### Rapid Risk Increase

```text
Risk(t) - Risk(t-1) > threshold
```

Example:

```text
 RED SEA RISK INCREASE

Risk:
0.42 → 0.81

Change:
+92.8%

Reason:
Multiple security-related shipping reports detected.
```

---

# 18. FR-13 — Freight Forecast Integration

The NLP engine shall expose structured features to the freight forecasting model.

### Features

```text
avg_sentiment
negative_news_ratio
news_volume
news_volume_zscore

red_sea_risk
suez_risk
malacca_risk

event_severity
geopolitical_shock
vessel_diversion_signal
port_disruption_signal
```

These features can be combined with existing quantitative variables.

### Existing variables

```text
Historical freight rates
Bunker prices
Vessel availability
Cargo demand
Port congestion
Seasonality
```

### Combined model

```text
                Freight Data
                     
                Market Data
                     
              NLP Risk Signals
                     
                     
             Feature Engineering
                     
                     
              Forecasting Model
                     
                     
              Freight Prediction
```

---

# 19. FR-14 — Historical Analysis

The system shall allow users to inspect historical:

* Sentiment
* News volume
* Chokepoint risk
* Major events
* Freight rates

This will allow the project team to determine whether NLP signals correlate with subsequent freight movements.

Example:

```text
Date       Red Sea Risk    Freight Rate

Aug 01        0.21          $28.2
Aug 05        0.27          $28.5
Aug 10        0.63          $30.1
Aug 15        0.82          $34.7
Aug 20        0.75          $36.1
```

---

# 20. Dashboard Requirements

The frontend should provide four primary sections.

## A. Market Sentiment

```text
MARITIME MARKET SENTIMENT

Current:
-0.42

Trend:
↓ Negative
```

Include a historical line chart.

---

## B. Chokepoint Risk

```text
CHOKEPOINT RISK

Red Sea          0.88   CRITICAL
Suez Canal       0.76   CRITICAL
Malacca          0.21   LOW
```

---

## C. Active Alerts

```text
 RED SEA DISRUPTION

Risk: 0.88
News surge: +285%
Sentiment: -0.84

Detected:
Vessel diversion
Security attacks
```

---

## D. News Feed

Each article should display:

```text
Headline
Source
Timestamp
Sentiment
Region
Event
Severity
```

Example:

```text
Shipping companies divert vessels from Red Sea

Trade News
10:42 AM

 Negative -0.91
 Red Sea
 Vessel Diversion
Severity: HIGH
```

---

# 21. Data Model

## News Article

```text
news_articles

id
title
description
raw_text
source
url
published_at
collected_at
processed_at

sentiment
sentiment_score

region
chokepoint
event_type
event_confidence
event_severity
```

## Risk Snapshot

```text
chokepoint_risk

id
chokepoint
timestamp

news_volume
news_volume_zscore

average_sentiment
negative_news_ratio

event_severity
recency_score

risk_score
risk_level
```

## Alert

```text
alerts

id
timestamp
alert_type
region
severity
risk_score
description
status
```

---

# 22. Proposed Technology Stack

## Backend

```text
Python
FastAPI
```

## NLP

```text
Hugging Face Transformers
FinBERT
spaCy / NER
```

## Data Processing

```text
Pandas
NumPy
scikit-learn
```

## Database

```text
PostgreSQL
```

## Scheduling

```text
Cron / Celery / APScheduler
```

## Frontend

```text
React
TypeScript
Chart.js / Recharts
```

## Optional

```text
Redis
Docker
```

---

# 23. System Architecture

```text
                    NEWS SOURCES
                         
              
                                   
           RSS/API               GDELT
                                   
              
                         
                 NEWS INGESTION
                         
                         
                 DEDUPLICATION
                         
                         
                 RELEVANCE FILTER
                         
                         
                 
                                 
             FinBERT          NER/Event
             Sentiment         Detection
                                 
                 
                         
                  FEATURE ENGINE
                         
             
                                   
        Sentiment    News Volume   Events
                                   
             
                         
                RISK CALCULATION
                         
             
                                    
       Dashboard                 Alerts
             
             
      FREIGHT FORECAST
             
             
     CHARTERING DECISION
```

---

# 24. API Requirements

## GET `/news`

Returns recent maritime news.

```json
{
  "articles": []
}
```

---

## GET `/sentiment`

Returns current and historical sentiment.

```json
{
  "current_score": -0.42,
  "trend": "negative"
}
```

---

## GET `/risk`

Returns chokepoint risk.

```json
{
  "red_sea": 0.88,
  "suez": 0.76,
  "malacca": 0.21
}
```

---

## GET `/alerts`

Returns active alerts.

```json
{
  "alerts": []
}
```

---

## GET `/forecast/features`

Returns NLP features for the forecasting engine.

```json
{
  "sentiment": -0.42,
  "red_sea_risk": 0.88,
  "suez_risk": 0.76,
  "news_volume_zscore": 3.21,
  "geopolitical_shock": 1
}
```

---

# 25. MVP Scope

The first working version should **not** attempt to implement everything.

### Phase 1 — News

* [ ] Collect news
* [ ] Store articles
* [ ] Deduplicate
* [ ] Filter maritime articles

### Phase 2 — NLP

* [ ] FinBERT
* [ ] Sentiment score
* [ ] Event keywords
* [ ] Chokepoint classification

### Phase 3 — Risk

* [ ] News volume
* [ ] News anomaly
* [ ] Event severity
* [ ] Risk score

### Phase 4 — Dashboard

* [ ] Sentiment chart
* [ ] Chokepoint risk cards
* [ ] News feed
* [ ] Alert panel

### Phase 5 — Forecasting Integration

* [ ] Generate NLP features
* [ ] Feed features into forecasting model
* [ ] Compare forecast with/without NLP features

---

# 26. Success Metrics

## Data Pipeline

```text
News ingestion success rate > 95%
Duplicate rate < 10%
Relevant article filtering accuracy > 80%
```

## NLP

Target initial performance:

```text
Sentiment F1 > 0.75
Event classification F1 > 0.70
```

These are development targets and should be validated using a manually labelled maritime dataset.

## Risk Detection

Measure:

```text
Precision of major-event alerts
False alert rate
Detection latency
Correlation between risk signals and freight movements
```

## Forecasting

The most important experiment:

```text
Model A:
Freight features only

vs.

Model B:
Freight features + NLP features
```

Compare:

```text
MAE
RMSE
MAPE
Directional accuracy
```

The NLP module should demonstrate whether incorporating news/geopolitical signals actually improves forecasting performance.

---

# 27. Evaluation Dataset

Create a manually labelled dataset of maritime articles.

Each article should be labelled:

```text
Sentiment:
Positive / Neutral / Negative

Event:
None / Security / Port / Weather / Sanctions / etc.

Region:
Red Sea / Suez / Malacca / Other

Severity:
Low / Medium / High / Critical
```

A practical MVP target is:

```text
500–2,000 labelled articles
```

This dataset can be used to evaluate the system and potentially fine-tune the models later.

---

# 28. Key Design Principle

The system should distinguish between:

### Sentiment

> "How does the article describe the situation?"

and

### Risk

> "How significant is this situation for maritime transportation?"

These are **not the same thing**.

For example:

```text
Article A:
"Shipping companies successfully resume Suez operations."

Sentiment:
Positive

Risk:
Potentially LOW
```

While:

```text
Article B:
"Shipping companies suspend Suez operations following attacks."

Sentiment:
Negative

Risk:
HIGH
```

The risk engine therefore combines sentiment with:

```text
Event severity
Geographic relevance
News volume
Recency
```

rather than relying on FinBERT alone.

---

# 29. Example End-to-End Scenario

### 09:00

System detects:

```text
Red Sea articles:
7/day
```

Risk:

```text
0.18 LOW
```

---

### 11:00

Several security-related articles appear.

```text
Red Sea articles:
23/day

Sentiment:
-0.62

Event severity:
0.71
```

Risk rises:

```text
0.18 → 0.57
```

System generates:

```text
 ELEVATED RED SEA RISK
```

---

### 13:00

Multiple carriers announce diversions.

```text
Red Sea articles:
51/day

News anomaly:
+420%

Sentiment:
-0.86

Event severity:
0.93
```

Risk:

```text
0.89
```

System generates:

```text
 CRITICAL MARITIME DISRUPTION

Red Sea

Risk Index: 0.89

Detected:
• Security attacks
• Vessel diversions
• Route disruption
• Increased shipping activity
```

---

### Forecasting Model

The NLP engine sends:

```text
red_sea_risk = 0.89
news_volume_zscore = 4.2
sentiment = -0.86
geopolitical_shock = 1
```

The freight model updates its prediction:

```text
Previous forecast:
$31.5 / MT

Updated forecast:
$35.8 / MT
```

The chartering dashboard can then flag:

```text
 Consider earlier vessel fixing
```

The system does **not** automatically execute the decision.

---

# 30. Future Enhancements

## V2 — Maritime-Specific Sentiment Model

Fine-tune FinBERT using labelled shipping news.

## V2 — Event Extraction Model

Replace keyword rules with a trained event-classification model.

## V2 — Route Impact Model

Estimate:

```text
Red Sea disruption
       ↓
Route diversion
       ↓
Additional distance
       ↓
Additional sailing days
       ↓
Additional bunker consumption
       ↓
Freight cost impact
```

## V3 — Causal / Lag Analysis

Determine whether geopolitical signals lead freight movements by:

```text
1 day
3 days
7 days
14 days
```

## V3 — Automated Forecast Adjustment

Use the geopolitical risk index as a dynamic forecasting feature.

## V4 — Global Maritime Risk Map

Display:

```text
Red Sea       
Suez          
Malacca       🟢
Panama        🟠
Black Sea     🟠
```

with historical risk timelines.

---

# 31. Final Product Definition

The **Maritime Market Intelligence & Geopolitical Risk Engine** will convert unstructured maritime information into actionable quantitative signals.

### Input

```text
Maritime News
Geopolitical Events
Shipping Reports
```

### Processing

```text
NLP
+
Sentiment Analysis
+
Event Detection
+
Entity Recognition
+
Anomaly Detection
```

### Output

```text
Market Sentiment
Chokepoint Risk
Geopolitical Shock Alerts
```

### Business Impact

```text
Risk Signals
      ↓
Freight Forecast
      ↓
Chartering Intelligence
      ↓
Better Procurement Timing
      ↓
Potential Cost Reduction
```

### Core Value Proposition

> **"The system transforms real-time maritime news and geopolitical events into quantitative risk signals that enhance freight-rate forecasting and support proactive vessel chartering decisions."**
