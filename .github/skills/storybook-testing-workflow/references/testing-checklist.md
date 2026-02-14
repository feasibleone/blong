# Testing Checklist

Use this checklist when developing a component to ensure comprehensive test coverage.

## Component Testing Checklist Template

### Rendering & Display

- [ ] Renders with no data (empty state)
- [ ] Renders with valid data
- [ ] Shows loading state while fetching
- [ ] Handles large dataset (1000+ entries)

### User Interactions

- [ ] Click actions work
- [ ] Form submissions work
- [ ] Navigation works
- [ ] State updates correctly

### Filtering & Search

- [ ] Filter by primary criteria
- [ ] Filter by secondary criteria
- [ ] Multiple filters work together (AND logic)
- [ ] Clearing filter restores all data
- [ ] Search highlights matches
- [ ] Case-insensitive search
- [ ] Regex special characters escaped

### Accessibility

- [ ] Keyboard navigation (Tab, Arrow keys)
- [ ] Screen reader announces content
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible
- [ ] No keyboard traps

### Themes

- [ ] Dark theme loads
- [ ] Light theme loads
- [ ] Custom colors apply
- [ ] Toggle theme preserves data

### Performance

- [ ] Large dataset renders in reasonable time
- [ ] Filter response is fast
- [ ] Search response is fast

## LogViewer Example Checklist

This is a comprehensive example for a complex component.

### Rendering & Display

- [x] Renders with no data (empty state)
- [x] Renders with valid entries
- [x] Shows loading state while fetching
- [x] Handles large dataset (1000+ entries)

### Filtering

- [x] Filter by level (info/warn/error)
- [x] Filter by service name
- [x] Filter by trace ID
- [x] Multiple filters work together (AND logic)
- [x] Clearing filter restores all rows

### Search

- [x] Search highlights matches in message
- [x] Search highlights in JSON objects
- [x] Search highlights in exception stack
- [x] Case-insensitive search
- [x] Regex special characters escaped

### Visualization

- [x] Exception stack shows code context
- [x] HTTP request shows method/URL/headers
- [x] HTTP response shows status/body
- [x] JSON syntax highlighting applied
- [x] Timestamps toggle between absolute/relative

### Interaction

- [x] Clicking trace ID applies filter
- [x] Trace ID link icon opens external URL
- [x] Expanding row shows full content
- [x] Collapsing row hides details
- [x] Scrolling maintains scroll position

### Accessibility

- [x] Keyboard navigation (Tab, Arrow keys)
- [x] Screen reader announces level/service
- [x] Color contrast meets WCAG AA
- [x] Focus indicators visible
- [x] No keyboard traps

### Themes

- [x] Dark theme loads
- [x] Light theme loads
- [x] Custom colors apply
- [x] Toggle theme preserves data

### Performance

- [x] 1000 entries render in < 2s
- [x] Filter response < 500ms
- [x] Search response < 500ms
