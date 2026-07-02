# Contributing to m0x-tune

Thank you for your interest in contributing to m0x-tune! We welcome contributions from the community.

## How to Contribute

### Reporting Issues

If you find a bug or have a feature request, please open an issue on GitHub with:
- A clear description of the problem
- Steps to reproduce
- Your environment details (OS, Python version, GPU model)

### Code Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

#### Backend

```bash
# Create virtual environment
python -m venv .venv

# Activate it
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r backend/requirements.txt

# Run backend
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend

```bash
cd finetune-ui
npm install
npm run dev
```

## Code Guidelines

### Python

- Follow PEP 8 style guide
- Use type hints
- Write docstrings for functions and classes

### TypeScript/React

- Use TypeScript for type safety
- Follow existing component patterns
- Keep components small and focused

## Pull Request Process

1. Ensure your changes pass all existing tests
2. Update documentation as needed
3. Include a clear description of what your PR does
4. Link to any related issues

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
