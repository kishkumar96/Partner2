# Contributing to Climate Risk Dashboard

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Issue Guidelines](#issue-guidelines)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors.

### Our Standards

- ✅ Be respectful and constructive
- ✅ Accept constructive criticism gracefully  
- ✅ Focus on what's best for the community
- ✅ Show empathy towards others

### Unacceptable Behavior

- ❌ Harassment or discriminatory language
- ❌ Trolling or insulting comments
- ❌ Personal or political attacks
- ❌ Publishing others' private information

## Getting Started

### Prerequisites

- Node.js 18+ and npm 9+
- Git
- Code editor (VS Code recommended)

### Initial Setup

```bash
# 1. Fork the repository
# Click "Fork" button on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/climate-dashboard.git
cd climate-dashboard

# 3. Add upstream remote
git remote add upstream https://github.com/ORIGINAL_OWNER/climate-dashboard.git

# 4. Install dependencies
npm install

# 5. Copy environment file
cp .env.example .env.local

# 6. Start development server
npm run dev
```

Visit http://localhost:3000 to see the application.

## Development Workflow

### 1. Create a Branch

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fix
git checkout -b fix/bug-description
```

### 2. Make Changes

- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run tests
npm test

# Check types
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

### 4. Commit Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format: <type>(<scope>): <description>

git commit -m "feat(map): add cyclone intensity visualization"
git commit -m "fix(filters): resolve date range selection bug"
git commit -m "docs(readme): update installation instructions"
```

#### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements

### 5. Push Changes

```bash
git push origin feature/your-feature-name
```

### 6. Create Pull Request

1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Fill out the PR template
4. Link related issues
5. Request review

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types (avoid `any`)
- Use interfaces for object shapes
- Document complex types

```typescript
// Good ✅
interface Region {
  id: string;
  name: string;
  population: number;
}

// Avoid ❌
const region: any = { ... };
```

### React Components

- Use functional components with hooks
- Keep components focused and small
- Extract reusable logic into custom hooks
- Use proper prop types

```typescript
// Good ✅
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ 
  label, 
  onClick, 
  variant = 'primary' 
}) => {
  return (
    <button 
      onClick={onClick}
      className={`btn btn-${variant}`}
    >
      {label}
    </button>
  );
};
```

### File Organization

```
src/
├── app/              # Next.js app router pages
├── components/       # React components
│   ├── __tests__/   # Component tests
│   └── ui/          # Reusable UI components
├── hooks/           # Custom React hooks
├── utils/           # Utility functions
├── types/           # TypeScript types
├── data/            # Static data
└── styles/          # Global styles
```

### Naming Conventions

- **Components**: PascalCase (`MapView.tsx`)
- **Hooks**: camelCase with "use" prefix (`useMapState.ts`)
- **Utils**: camelCase (`formatDate.ts`)
- **Types**: PascalCase (`FilterState`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_ZOOM_LEVEL`)

### Code Style

```typescript
// Use arrow functions
const calculateRisk = (value: number): string => {
  return value > 0.7 ? 'high' : 'low';
};

// Destructure props
const MapLegend: React.FC<Props> = ({ items, title }) => { ... };

// Use template literals
const message = `Risk level: ${level}`;

// Use optional chaining
const name = user?.profile?.name;

// Use nullish coalescing
const port = config.port ?? 3000;
```

## Testing Requirements

### Unit Tests

- Write tests for utility functions
- Test component logic separately
- Aim for >70% code coverage

```typescript
// Example: utils/__tests__/formatDate.test.ts
import { formatDate } from '../formatDate';

describe('formatDate', () => {
  it('formats ISO date correctly', () => {
    expect(formatDate('2024-01-15')).toBe('Jan 15, 2024');
  });
});
```

### Component Tests

- Test user interactions
- Test different states
- Test accessibility

```typescript
// Example: components/__tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('calls onClick when clicked', async () => {
    const handleClick = jest.fn();
    render(<Button label="Click me" onClick={handleClick} />);
    
    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Integration Tests

- Test complete user flows
- Test data loading and display
- Test error scenarios

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Tests added/updated
- [ ] Tests passing locally
- [ ] Documentation updated
- [ ] No console errors or warnings
- [ ] Commit messages follow convention

### PR Title Format

```
feat(scope): brief description

fix(map): resolve marker clustering issue
docs(api): add endpoint documentation
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Screenshots (if applicable)
Add screenshots here

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests added
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### Review Process

1. **Automated Checks**: CI/CD must pass
2. **Code Review**: At least one approval required
3. **Testing**: Reviewer tests changes locally
4. **Approval**: PR approved by maintainer
5. **Merge**: Squash and merge to main

## Issue Guidelines

### Reporting Bugs

Use the bug report template:

```markdown
## Bug Description
Clear description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Screenshots
Add screenshots if applicable

## Environment
- OS: [e.g. macOS 12.0]
- Browser: [e.g. Chrome 98]
- Version: [e.g. 1.0.0]
```

### Feature Requests

Use the feature request template:

```markdown
## Feature Description
Clear description of the feature

## Problem It Solves
What problem does this address?

## Proposed Solution
How should it work?

## Alternatives Considered
Other approaches considered

## Additional Context
Any other relevant information
```

## Development Tips

### Hot Reload Issues

```bash
# Clear Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

### Debugging

```typescript
// Use React DevTools
// Install: https://react-devtools.com/

// Add breakpoints in browser DevTools
debugger;

// Use console methods effectively
console.log('State:', state);
console.table(data);
console.time('operation');
// ... code ...
console.timeEnd('operation');
```

### Performance Profiling

```typescript
// Use React Profiler
import { Profiler } from 'react';

<Profiler id="MapView" onRender={onRenderCallback}>
  <MapView />
</Profiler>
```

## Getting Help

- 📖 Read the [README](README.md)
- 🚀 Check [DEPLOYMENT.md](DEPLOYMENT.md)
- 🔍 Search existing issues
- 💬 Join discussions
- 📧 Email: dev@yourdomain.com

## Recognition

Contributors will be recognized in:
- GitHub contributors page
- Release notes
- README acknowledgments

Thank you for contributing! 🎉
