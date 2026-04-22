# Architecture Documentation
## Personal Finance Analytics Platform

**Document Version:** 1.0  
**Date:** 2026-04-22  
**Status:** Active

---

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [ER Diagram](#2-entity-relationship-diagram)
3. [Use Case Diagram](#3-use-case-diagram)
4. [Activity Diagram](#4-activity-diagram)
5. [Sequence Diagrams](#5-sequence-diagrams)
6. [Class Diagram](#6-class-diagram)
7. [Component Diagram](#7-component-diagram)
8. [Data Flow Diagram](#8-data-flow-diagram)
9. [Deployment Diagram](#9-deployment-diagram)

---

## 1. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Next.js Frontend (React + TypeScript + Tailwind CSS)   │  │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐   │  │
│  │  │   Login     │  │  Dashboard   │  │ Upload Form  │   │  │
│  │  │   Page      │  │  Analytics   │  │  Statements  │   │  │
│  │  │             │  │  Charts      │  │  Transactions│   │  │
│  │  └─────────────┘  └──────────────┘  └──────────────┘   │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS / REST API
┌──────────────────────┴──────────────────────────────────────────┐
│                    API LAYER (Express)                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Authentication & JWT Middleware               │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌────────────┬──────────────┬──────────────┬──────────────┐   │
│  │   Auth     │   Upload     │ Transaction  │ Analytics    │   │
│  │  Routes    │   Routes     │   Routes     │  Routes      │   │
│  └────────────┴──────────────┴──────────────┴──────────────┘   │
│  ┌────────────┬──────────────┬──────────────┐                   │
│  │  File      │   Parser     │   Claude     │                   │
│  │  Upload    │   Services   │    AI API    │                   │
│  │  (Multer)  │  (PDF/Excel) │  Integration │                   │
│  └────────────┴──────────────┴──────────────┘                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ SQL / TCP
┌──────────────────────┴──────────────────────────────────────────┐
│                   DATA LAYER                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Database                                      │  │
│  │  ┌──────────┐ ┌────────────┐ ┌──────────────┐           │  │
│  │  │  Users   │ │ Statements │ │ Transactions │           │  │
│  │  │  Table   │ │  Table     │ │   Table      │           │  │
│  │  └──────────┘ └────────────┘ └──────────────┘           │  │
│  │  ┌──────────┐ ┌────────────┐                            │  │
│  │  │Categories│ │   (Indices)│                            │  │
│  │  │  Table   │ │  (Backups) │                            │  │
│  │  └──────────┘ └────────────┘                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ├─ External API: Claude AI (Anthropic)
                       ├─ External: Google OAuth
                       └─ External: Local File Storage (MVP)
```

---

## 2. Entity-Relationship Diagram

```
                          ┌─────────────┐
                          │   USERS     │
                          ├─────────────┤
                          │ id (PK)     │
                          │ email       │◄─────────────┐
                          │ password    │              │
                          │ google_id   │              │
                          │ name        │              │
                          │ created_at  │              │
                          └──────┬──────┘              │
                                 │                    │
                    ┌────────────┼────────────┐       │
                    │            │            │       │
                    │ 1:N        │ 1:N        │ 1:N   │
                    │            │            │       │
         ┌──────────▼────┐ ┌────▼──────────┐ │  ┌────▼──────────┐
         │ STATEMENTS    │ │ CATEGORIES    │ │  │    ROLES      │
         ├───────────────┤ ├───────────────┤ │  ├───────────────┤
         │ id (PK)       │ │ id (PK)       │ │  │ id (PK)       │
         │ user_id (FK)  │ │ user_id (FK)  │ │  │ user_id (FK)  │
         │ bank_name     │ │ name          │ │  │ role_type     │
         │ file_name     │ │ color         │ │  │ created_at    │
         │ uploaded_at   │ │ is_default    │ │  └───────────────┘
         │ status        │ │ created_at    │ │
         └────┬──────────┘ └───────────────┘ │
              │                              │
              │ 1:N                          │
              │                              │
         ┌────▼──────────────┐              │
         │  TRANSACTIONS     │              │
         ├───────────────────┤              │
         │ id (PK)           │              │
         │ user_id (FK)      │──────────────┤
         │ statement_id (FK) │
         │ category_id (FK) ─┼──────────────┘
         │ date              │
         │ amount            │
         │ description       │
         │ type (debit/cred) │
         │ ai_suggested_cat  │
         │ created_at        │
         └───────────────────┘

Indices Created:
- transactions.user_id, transactions.date
- transactions.category_id
- statements.user_id
- categories.user_id
- users.email (UNIQUE)
```

---

## 3. Use Case Diagram

```
                                    ┌─────────────────────┐
                                    │   File Provider     │
                                    │  (Bank Statements)  │
                                    └──────────┬──────────┘
                                               │
                                          provides
                                               │
    ┌────────────────────────────────────────┬┴──────────────────────────────┐
    │                                        │                               │
    │                                   ┌────▼────────┐                      │
    │                                   │ Upload Form  │                      │
    │                                   │   (UI)       │                      │
    │                                   └────┬─────────┘                      │
    │                                        │                               │
    ▼                                        ▼                               ▼
┌─────────┐  register    ┌─────────┐   select     ┌──────────────┐
│ New     ├────────────►│ System  │◄──────────────│ Bank Name    │
│ User    │             │         │               │ Detection    │
└─────────┘             │         │               └──────────────┘
                        │         │
                        │  Main   │
                        │ System  │
                        │         │
     ┌──────────────────│         │
     │                  │         │
login │                 │         │
     │                  │         │
     ▼                  │         │
┌─────────┐             │         │
│Existing │             │         │
│ User    │             │         │
└─────────┘             │         │
                        │         │
                        │         │
    ┌───────────────────│         │
    │                   │         │
    │                   └────┬────┘
    │                        │
    ▼                        ▼
┌─────────────────┐    ┌──────────────────────────┐
│ View Dashboard  │    │ Categorize Transactions  │
│ Analytics       │    │ (Claude AI)              │
│ Charts          │    │ Manual Override          │
└─────────────────┘    └──────────────────────────┘
    ▲
    │
    │
┌───┴──────────────────────────────────────────────────┐
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Extract Transactions from Statements         │   │
│  │ (ICICI/HDFC/Axis Parsers)                   │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## 4. Activity Diagram

### File Upload & Processing Flow

```
                              START
                               │
                               ▼
                    ┌──────────────────────┐
                    │  User Selects File   │
                    │  (Drag or Click)     │
                    └──────┬───────────────┘
                           │
                           ▼
                    ┌──────────────────────┐
                    │  Validate File       │
                    │  Size < 10MB?        │
                    │  Type (PDF/Excel)?   │
                    └──────┬────────┬──────┘
                           │        │
                      Yes  │        │ No
                           ▼        ▼
                    ┌────────────┐  ┌─────────────────┐
                    │ Detect     │  │ Show Error      │
                    │ Bank Name  │  │ Invalid File    │
                    └────┬───────┘  └────┬────────────┘
                         │               │
                         ▼               │
                    ┌─────────────────┐  │
                    │ Save File       │  │
                    │ Temporarily     │  │
                    └────┬────────────┘  │
                         │               │
                         ▼               │
                    ┌─────────────────────────────┐
                    │ Parse Based on Bank        │
                    │ ICICI/HDFC (PDF)           │
                    │ Axis (Excel)               │
                    └────┬──────────────┬────────┘
                         │              │
                    Success   │         │ Parse Error
                         │              │
                         ▼              ▼
                    ┌─────────────┐  ┌──────────────────┐
                    │ Extract     │  │ Delete Temp File │
                    │ Transactions│  │ Show Error       │
                    │ Data        │  │ "Invalid Format" │
                    └────┬────────┘  └────────┬─────────┘
                         │                    │
                         ▼                    │
                    ┌──────────────────┐      │
                    │ Validate Data    │      │
                    │ (Date, Amount)   │      │
                    └────┬─────────┬───┘      │
                         │         │          │
                    Valid │         │ Invalid │
                         │         │          │
                         ▼         ▼          │
                    ┌────────┐ ┌───────────┐ │
                    │ Store  │ │ Show Error│ │
                    │ in DB  │ │ Invalid   │ │
                    └────┬───┘ │ Data      │ │
                         │     └────┬──────┘ │
                         │          │        │
                         ▼          ▼        ▼
                    ┌────────────────────────────┐
                    │ Delete Temp File           │
                    └────┬─────────────────────┬─┘
                         │                     │
                    Success  │                 │ Failure
                         │                     │
                         ▼                     ▼
                    ┌──────────────────┐  ┌─────────────┐
                    │ Show Success Msg │  │ Show Error  │
                    │ Reload Statements│  │ Msg         │
                    └────┬─────────────┘  └─────┬───────┘
                         │                      │
                         └──────┬───────────────┘
                                │
                                ▼
                              END
```

---

## 5. Sequence Diagrams

### 5.1 User Registration & Login Flow

```
User           Frontend           Backend          Database         JWT
 │                │                  │                │              │
 │──Register───────│                  │                │              │
 │                │──POST /auth/────►│                │              │
 │                │   register        │                │              │
 │                │                   │─Hash Password─►│              │
 │                │                   │                │──Store User──│
 │                │                   │◄───────────────│              │
 │                │◄──User Created────│                │              │
 │                │                   │              Generate         │
 │                │◄──JWT Token───────│◄──────────────────────────────│
 │◄──Token────────│                   │                │              │
 │                │                   │                │              │
 │  (Login)       │                   │                │              │
 │────Login───────│                   │                │              │
 │                │──POST /auth/──────►│                │              │
 │                │   login            │                │              │
 │                │                    │──Query User───►│              │
 │                │                    │                │──Find User──│
 │                │                    │◄────User────────│              │
 │                │                    │──Compare Pwd───┐              │
 │                │                    │◄────Match──────┘              │
 │                │                    │              Generate         │
 │                │◄───JWT Token───────│◄──────────────────────────────│
 │◄──Token────────│                    │                │              │
 │                │                    │                │              │
 │──Authenticated─│                    │                │              │
 │   Request      │──GET /dashboard───►│──Verify JWT───────────────────►
 │                │                    │──Protected────►│              │
 │                │◄──User Data────────│                │              │
 │◄──Dashboard────│                    │                │              │
```

### 5.2 File Upload & Categorization Flow

```
User           Frontend          Backend         File System      Database        Claude AI
 │               │                 │                │                │              │
 │──Upload File──│                 │                │                │              │
 │               │─FormData────────►│                │                │              │
 │               │  (file + bank)   │──Save File───►│                │              │
 │               │                  │                │──✓ Saved───────┤              │
 │               │                  │──Detect Bank──┐                │              │
 │               │                  │◄──ICICI───────┘                │              │
 │               │                  │──Parse PDF────►│                │              │
 │               │                  │                │──Extract───────┤              │
 │               │                  │◄───Trans List──┤                │              │
 │               │                  │                │                │              │
 │               │                  │──Validate Data─┐                │              │
 │               │                  │◄──Valid────────┘                │              │
 │               │                  │                │                │              │
 │               │                  │──Create Statement────────────────►│              │
 │               │                  │                │                │──Insert──────│
 │               │                  │                │                │◄──ID─────────│
 │               │                  │──Insert Transactions────────────►│              │
 │               │                  │                │                │──Bulk Insert│
 │               │                  │                │                │◄──Success────│
 │               │                  │                │                │              │
 │               │                  │──Queue for Categorization────────────────────►│
 │               │                  │                │                │              │
 │               │                  │                │                │         Process
 │               │                  │                │                │         Batch
 │               │                  │◄─AI Suggestions────────────────────────────────│
 │               │                  │                │                │              │
 │               │                  │──Update ai_suggested_category──►│              │
 │               │                  │                │                │──Update──────│
 │               │                  │◄──Delete Temp File──┐          │◄──Success────│
 │               │                  │              ◄──Done┘           │              │
 │               │◄──Success────────│                │                │              │
 │◄──File Processed──│                │                │                │              │
 │                   │                │                │                │              │
```

### 5.3 Analytics Dashboard Flow

```
User           Frontend          Backend         Database         Recharts
 │               │                 │                │                │
 │ Navigate       │                 │                │                │
 │ Dashboard      │                 │                │                │
 │────────────────├─GET /analytics/ │                │                │
 │                │    pie          ├─Query by────────────────────────►│
 │                │                 │  category_id    │──SUM amount──┐│
 │                │                 │                │              ││
 │                │                 │                │◄─Results─────┘│
 │                │                 │◄─Data-─────────────────────────│
 │                ├─GET /analytics/ │                │                │
 │                │    bar          ├─Query monthly─────────────────►│
 │                │                 │  income/expense │──Aggregate───│
 │                │                 │                │              ││
 │                │                 │                │◄─Results─────┘│
 │                │                 │◄─Data─────────────────────────│
 │                ├─GET /transactions│                │                │
 │                │   /stats/summary ├─SUM(credit)────────────────────►│
 │                │                 │  SUM(debit)     │──Calculate───┐│
 │                │                 │                │              ││
 │                │                 │                │◄─Stats────────┘│
 │                │                 │◄─Stats────────────────────────│
 │                │                 │                │                │
 │◄─Render Pie────├─Render Bar──────│                │                │
 │  and Bar       │  and Stats       │                │                │
 │  Charts        │                 │                │                │
 │                ├─Display Cards────────────────────►│                │
 │                │  (Total, Income,  │                │                │
 │                │   Expenses)       │                │                │
 │◄─Dashboard────│                 │                │                │
 │  Complete     │                 │                │                │
```

---

## 6. Class Diagram

```
┌─────────────────────────────────┐
│       User Entity               │
├─────────────────────────────────┤
│ - id: UUID (PK)                 │
│ - email: string (UNIQUE)        │
│ - passwordHash: string          │
│ - googleId: string (optional)   │
│ - name: string                  │
│ - createdAt: timestamp          │
├─────────────────────────────────┤
│ + register()                    │
│ + login()                       │
│ + getProfile()                  │
│ + updateProfile()               │
└──────────────┬──────────────────┘
               │ 1:N
               │
┌──────────────▼──────────────────┐
│    Statement Entity             │
├─────────────────────────────────┤
│ - id: UUID (PK)                 │
│ - userId: UUID (FK)             │
│ - bankName: string              │
│ - fileName: string              │
│ - uploadedAt: timestamp         │
│ - status: enum                  │
├─────────────────────────────────┤
│ + parse()                       │
│ + getTransactions()             │
│ + delete()                      │
└──────────────┬──────────────────┘
               │ 1:N
               │
┌──────────────▼──────────────────────────┐
│    Transaction Entity                  │
├────────────────────────────────────────┤
│ - id: UUID (PK)                        │
│ - userId: UUID (FK)                    │
│ - statementId: UUID (FK)               │
│ - date: date                           │
│ - amount: decimal(12,2)                │
│ - description: string                  │
│ - type: enum (debit/credit)            │
│ - categoryId: UUID (FK) [optional]     │
│ - aiSuggestedCategory: string          │
├────────────────────────────────────────┤
│ + updateCategory()                     │
│ + updateDescription()                  │
│ + getAnalytics()                       │
│ + getCategoryBreakdown()               │
└──────────────┬───────────────────────┬─┘
               │                       │
         1:N   │                       │ N:1
               │                       │
┌──────────────▼──────────┐   ┌───────▼──────────────┐
│   Category Entity       │   │  CategoryBudget      │
├────────────────────────┤   ├──────────────────────┤
│ - id: UUID (PK)        │   │ - monthlyBudget      │
│ - userId: UUID (FK)    │   │ - alertThreshold     │
│ - name: string         │   │ - lastUpdated        │
│ - color: string        │   ├──────────────────────┤
│ - isDefault: boolean   │   │ + checkBudgetStatus()│
│ - createdAt: timestamp │   │ + sendAlert()        │
├────────────────────────┤   └──────────────────────┘
│ + create()             │
│ + update()             │
│ + delete()             │
│ + getTransactions()    │
│ + getTotalSpent()      │
└────────────────────────┘
```

---

## 7. Component Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                          │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              Presentation Components                │     │
│  │  ┌─────────────┬────────────────┬──────────────────┐ │     │
│  │  │   Login     │  Dashboard     │  Statements      │ │     │
│  │  │   Component │  Component     │  Component       │ │     │
│  │  └─────┬───────┴────────┬───────┴────────┬─────────┘ │     │
│  │        │                │                │           │     │
│  │  ┌─────▼────────────────▼────────────────▼────────┐  │     │
│  │  │       Common Layout Components                │  │     │
│  │  │  ┌──────────────┬──────────────┬───────────┐  │  │     │
│  │  │  │  Navigation  │  Sidebar     │ Modal     │  │  │     │
│  │  │  └──────────────┴──────────────┴───────────┘  │  │     │
│  │  └─────────────────────────────────────────────────┘  │     │
│  │                                                      │     │
│  │  ┌──────────────────────────────────────────────┐   │     │
│  │  │      Chart Components (Recharts)            │   │     │
│  │  │  ┌────────────────┬──────────────────────┐  │   │     │
│  │  │  │  PieChart      │  BarChart            │  │   │     │
│  │  │  │  Component     │  Component           │  │   │     │
│  │  │  └────────────────┴──────────────────────┘  │   │     │
│  │  └──────────────────────────────────────────────┘   │     │
│  │                                                      │     │
│  │  ┌──────────────────────────────────────────────┐   │     │
│  │  │      Forms & Input Components               │   │     │
│  │  │  ┌──────────┬─────────┬──────────────────┐  │   │     │
│  │  │  │FileUpload│ DateFilter│ CategorySelect│  │   │     │
│  │  │  │Component │Component│Component        │  │   │     │
│  │  │  └──────────┴─────────┴──────────────────┘  │   │     │
│  │  └──────────────────────────────────────────────┘   │     │
│  └──────────────────────────────────────────────────────┘     │
│                          │                                     │
│              Axios HTTP Client                                │
│                          │                                     │
└──────────────────────────┼─────────────────────────────────────┘
                           │
                           │ REST API / HTTPS
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    BACKEND (Express)                           │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │        Authentication & Authorization               │     │
│  │  ┌───────────────┬────────────────────────────────┐ │     │
│  │  │  JWT Middleware│  Auth Routes                 │ │     │
│  │  │  (Verify Token)│  (/api/auth/*)               │ │     │
│  │  └───────────────┴────────────────────────────────┘ │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │           API Routes & Controllers                 │     │
│  │  ┌──────────┬──────────┬────────────┬────────────┐ │     │
│  │  │ Upload   │Transaction│ Category  │ Analytics │ │     │
│  │  │ Routes   │ Routes   │ Routes    │ Routes    │ │     │
│  │  └──────────┴──────────┴────────────┴────────────┘ │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │       Business Logic & Services                      │     │
│  │  ┌─────────────┬─────────────┬──────────────────┐   │     │
│  │  │File Parser  │ Claude AI   │ Analytics Engine│   │     │
│  │  │Services     │ Integration │ (Queries & Agg) │   │     │
│  │  └─────────────┴─────────────┴──────────────────┘   │     │
│  │                                                     │     │
│  │  ┌──────────────────────────────────────────────┐   │     │
│  │  │  Parser Sub-Services                        │   │     │
│  │  │  ┌──────────┬──────────┬──────────────────┐ │   │     │
│  │  │  │ ICICI    │ HDFC     │ Axis (Excel)    │ │   │     │
│  │  │  │ (PDF)    │ (PDF)    │ Parser Service  │ │   │     │
│  │  │  └──────────┴──────────┴──────────────────┘ │   │     │
│  │  └──────────────────────────────────────────────┘   │     │
│  └──────────────────────────────────────────────────────┘     │
│                          │                                     │
│             PostgreSQL Driver / SQL                           │
│                          │                                     │
└──────────────────────────┼─────────────────────────────────────┘
                           │
                           │ TCP Port 5432
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│              PostgreSQL Database                               │
│                                                                │
│  ┌──────────┬──────────┬───────────────┬──────────────────┐   │
│  │  Users   │Statements│ Transactions  │ Categories       │   │
│  │  Table   │  Table   │ Table         │ Table            │   │
│  └──────────┴──────────┴───────────────┴──────────────────┘   │
│                                                                │
│  Indices: user_id, statement_id, category_id, date ranges    │
└────────────────────────────────────────────────────────────────┘

External Dependencies:
│
├─ Claude AI API (Anthropic)  [for auto-categorization]
├─ Google OAuth              [for social login]
├─ Multer File Upload        [for file handling]
└─ pdfplumber/xlsx           [for document parsing]
```

---

## 8. Data Flow Diagram

### Level 0 (Context Diagram)

```
        ┌──────────────────┐
        │   Bank User      │
        │                  │
        └────────┬─────────┘
                 │
    Bank         │
    Statements   │
                 ▼
    ┌─────────────────────────────────────┐
    │  Personal Finance Analytics System  │
    │                                     │
    │  ┌─────────────────────────────────┐│
    │  │ Upload, Parse, Categorize,      ││
    │  │ and Analyze Bank Transactions   ││
    │  └─────────────────────────────────┘│
    └──────────────┬──────────────────────┘
                   │
     Analytics &   │
     Insights      │
                   ▼
        ┌──────────────────┐
        │  Bank User View  │
        │  Dashboard       │
        │  & Reports       │
        └──────────────────┘

External Entities:
- Claude AI (Categorization Service)
- Google OAuth (Identity Provider)
- Bank Statement Files (Source Documents)
```

### Level 1 (Main Processes)

```
User Input      ┌────────────────────┐       Database
(Statement)─────│  1.0 Upload File   │──────►(Save)
                └────────────────────┘
                         │
                         ▼
Google Auth      ┌────────────────────┐       Database
(Login)──────────│  2.0 Authenticate  │──────►(Query)
                 └────────────────────┘
                         │
                         ▼
Statement        ┌────────────────────┐       Database
File─────────────│  3.0 Parse File    │──────►(Insert
(PDF/Excel)      │  (Bank Detection)  │       Trans)
                 └────────────────────┘
                         │
                         ▼
Transactions     ┌────────────────────┐       Claude AI
(Uncategorized)─│  4.0 Categorize    │──────►(Request)
                │  (AI + Manual)      │
                └────────────────────┘
                         │
                         ▼
                 ┌────────────────────┐       Database
                 │  5.0 Analytics     │──────►(Query)
                 │  (Dashboard Data)  │
                 └────────────────────┘
                         │
                         ▼
                  Dashboard View
```

---

## 9. Deployment Diagram

### Development Environment

```
┌─────────────────────────────────────────────────────────────┐
│                 Developer Workstation                       │
│                                                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Frontend (localhost:3000)                         │    │
│  │  - Next.js dev server                             │    │
│  │  - Hot reload enabled                             │    │
│  └────────────────┬─────────────────────────────────┘    │
│                   │                                       │
│                   │ HTTP:3000                             │
│                   │                                       │
│  ┌────────────────▼─────────────────────────────────┐    │
│  │  Backend (localhost:3001)                        │    │
│  │  - Express server                               │    │
│  │  - nodemon auto-reload                          │    │
│  │  - Environment: development                     │    │
│  └────────────────┬─────────────────────────────────┘    │
│                   │                                       │
│                   │ HTTP:3001                             │
│                   │                                       │
│  ┌────────────────▼─────────────────────────────────┐    │
│  │  PostgreSQL (localhost:5432)                     │    │
│  │  - Local instance                               │    │
│  │  - Development database: financeanalytics       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │  Local File Storage                              │     │
│  │  - /backend/uploads/ (temporary)                │     │
│  └──────────────────────────────────────────────────┘     │
│                                                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │  VS Code / IDE                                   │     │
│  │  - ESLint integration                            │     │
│  │  - Prettier formatting                          │     │
│  │  - Git integration                              │     │
│  └──────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
        │
        │ Git push
        │
┌───────▼─────────────────────────────────────────────────────┐
│  GitHub Repository (Remote)                                 │
│  - financeanalytics                                         │
│  - Branches: main, feature/*, bugfix/*                     │
│  - GitHub Actions: CI/CD Pipeline                          │
└─────────────────────────────────────────────────────────────┘
```

### Production Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Production Cloud                           │
│  (AWS / GCP / Railway / Render)                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Load Balancer / CDN                        │   │
│  │  (Cloudflare / AWS CloudFront)                         │   │
│  │  - SSL/TLS Termination                                │   │
│  │  - Geographic Distribution                             │   │
│  └────────────┬────────────────────────────────────────────┘   │
│               │                                                  │
│   ┌───────────┼──────────────┐                                 │
│   │           │              │                                 │
│   ▼           ▼              ▼                                 │
│ ┌──────────┐┌──────────┐┌──────────┐                          │
│ │Frontend  ││Frontend  ││Frontend  │  (3 replicas)           │
│ │Container ││Container ││Container │  Next.js app           │
│ │(Node)    ││(Node)    ││(Node)    │  Vertical auto-scale   │
│ └────┬─────┘└────┬─────┘└────┬─────┘                         │
│      │           │           │                               │
│      └───┬───────┼───────┬───┘                               │
│          │       │       │                                   │
│          ▼       ▼       ▼                                   │
│ ┌──────────────────────────────────┐                        │
│ │  API Load Balancer               │                        │
│ │  (AWS ALB / GCP LB)              │                        │
│ └───────────┬──────────────────────┘                        │
│             │                                               │
│   ┌─────────┼──────────────┐                               │
│   │         │              │                               │
│   ▼         ▼              ▼                               │
│ ┌──────────┐┌──────────┐┌──────────┐                      │
│ │Backend   ││Backend   ││Backend   │  (4 replicas)       │
│ │Container ││Container ││Container │  Express server    │
│ │(Node)    ││(Node)    ││(Node)    │  Auto-scale        │
│ └──────┬───┘└──────┬───┘└──────┬───┘                    │
│        │          │           │                        │
│        └────┬─────┼───────┬───┘                        │
│             │     │       │                           │
│             ▼     ▼       ▼                           │
│ ┌────────────────────────────────┐                   │
│ │  RDS PostgreSQL (Multi-AZ)     │                   │
│ │  - Primary + Standby Replica   │                   │
│ │  - Automated backups           │                   │
│ │  - Read replicas (optional)    │                   │
│ └────────────────────────────────┘                   │
│             │                                        │
│             ▼                                        │
│ ┌────────────────────────────────┐                  │
│ │  S3 / Cloud Storage            │                  │
│ │  - Uploaded statements (PDFs)  │                  │
│ │  - Backup data                 │                  │
│ └────────────────────────────────┘                  │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  Monitoring & Logging                        │ │
│  │  - CloudWatch / Datadog                      │ │
│  │  - Application Insights                      │ │
│  │  - Log aggregation (ELK / Splunk)            │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  External Services                           │ │
│  │  - Claude AI API (Anthropic)                │ │
│  │  - Google OAuth Provider                    │ │
│  │  - SendGrid (Email)                         │ │
│  └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. Technology Decision Matrix

| Layer | Technology | Rationale | Trade-offs |
|-------|-----------|-----------|-----------|
| **Frontend** | Next.js + React | SSR for SEO, built-in API routes, TypeScript | Steeper learning curve for SSR |
| **Backend** | Express.js | Lightweight, flexible, large ecosystem | Manual setup vs full framework |
| **Database** | PostgreSQL | ACID compliance, JSON support, strong queries | Scaling requires replication |
| **Auth** | JWT + NextAuth.js | Stateless, secure, OAuth-ready | Token expiry management |
| **File Upload** | Multer | Simple, middleware-based | Single-server only (MVP) |
| **PDF Parsing** | pdfplumber | Simple table extraction | Limited to tabular data |
| **Excel Parsing** | xlsx | Native JavaScript | Memory usage for large files |
| **AI Integration** | Claude 3.5 Sonnet | Best accuracy, cost-effective | API dependency, rate limits |
| **Styling** | Tailwind CSS | Utility-first, rapid development | Large CSS bundle |
| **Charts** | Recharts | React-native, responsive | Limited customization |
| **CI/CD** | GitHub Actions | Free for public repos, integrated | Vendor lock-in |
| **Hosting (Future)** | Render/Railway | Simple deployment, auto-scaling | Limited customization |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-04-22 | Initial architecture documentation |

---

**Last Updated:** 2026-04-22  
**Next Review:** After Phase 3.3 completion
