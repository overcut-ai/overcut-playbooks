# Remediate CVEs

## 📋 Overview

Analyzes Common Vulnerabilities and Exposures (CVEs) in your codebase and creates a comprehensive remediation plan. Performs impact assessment on your specific implementation, evaluates multiple remediation strategies (dependency updates, code changes, workarounds), and posts a detailed remediation plan to the issue. Once reviewed, automatically triggers PR creation via slash command to implement the fix.

## ⚡ Triggers

**Manual:**

- Slash command: `/remediate-cve`
- Can be used on any issue containing CVE information (CVE ID, security report, or vulnerability scan results)

**Automatic:**

- Event: `issue_labeled` when label is `security-vulnerability` or `cve`
- Delay: None
- Processes issues tagged with security labels

## 🎯 Use Cases

- Automated CVE impact analysis for dependencies
- Rapid security assessment for critical CVE disclosures
- Systematic evaluation of remediation options with trade-offs
- Context-aware vulnerability assessment (is it actually exploitable in your code?)
- Documented security decisions for compliance and audit trails
- Reducing analysis time for security patches
- Creating actionable remediation plans for the team

## 🔧 Prerequisites

- **Agents configured**:
  - **Security Engineer** - Specialized agent for CVE analysis and remediation planning (see `special agents/security-engineer-agent.md` for configuration instructions)
  - **Senior Developer** - General development agent for dependency analysis and code tracing
- Security scanning tool reports (Dependabot, Snyk, Trivy, etc.) or manual CVE reports

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds affected repos

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Identifies repositories that may be affected by the CVE

2. **Clone Repository** (`git.clone`) - Clones affected repos

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Shallow clone with depth 1 for efficiency

3. **Analyze CVE and Create Plan** (`agent.session`) - Comprehensive analysis and planning

   - Agents: Security Engineer, Senior Developer (coordinated by Coordinator)
   - Duration: ~20 min
   - Process:
     1. **Parse CVE Details**: Extract CVE ID, severity (CVSS score), affected versions, vulnerability type, and description
     2. **Identify Affected Dependencies**: Scan all dependency files across the entire codebase to find vulnerable packages/versions
     3. **Trace Vulnerable Code Usage**: Analyze how vulnerable components are used throughout the application (backend, frontend, build tools)
     4. **Assess Actual Risk**: Determine if vulnerability is exploitable given actual usage patterns
     5. **Evaluate Remediation Options**:
        - Direct dependency update (patch/minor/major version bump)
        - Alternative package or library
        - Code changes to avoid vulnerable functionality
        - Configuration or environment mitigations
        - Temporary workarounds
     6. **Analyze Trade-offs**: Compatibility issues, breaking changes, performance impact
     7. **Recommend Strategy**: Choose optimal approach with clear rationale
     8. **Create Remediation Plan**: Document complete plan in structured markdown

4. **Post Remediation Plan** (`agent.run`) - Posts plan to issue and triggers implementation
   - Agents: Security Engineer
   - Duration: ~2 min
   - Process:
     1. Posts the complete remediation plan as a comment for team review
     2. Posts a separate comment with `/pr` slash command to trigger implementation
   - The remediation plan includes:
     - CVE details (ID, severity, description)
     - Impact assessment (affected dependencies, exploitability, risk level)
     - Recommended remediation strategy with rationale
     - Alternative options considered and why they were not chosen
     - Breaking changes or compatibility concerns
     - Testing requirements
     - Rollback plan
   - Team can review the plan before the `/pr` command triggers implementation

```
[Identify] → [Clone] → [Analyze & Plan] → [Post Plan + /pr]
                              ↓                    ↓
                      - Parse CVE              Triggers
                      - Assess Risk         "Create PR from
                      - Evaluate Options       Design"
                      - Recommend Strategy     Workflow
```

## 📋 Remediation Plan Format

The workflow posts a structured remediation plan that includes:

### CVE Information

- CVE ID and links to official advisories
- CVSS severity score and risk rating
- Vulnerability type and description
- Affected package versions

### Impact Assessment

- Dependencies found in your codebase
- How vulnerable code is actually used
- Exploitability analysis (is it reachable/exploitable?)
- Risk level (Critical/High/Medium/Low) based on actual usage
- Affected services or components

### Recommended Remediation Strategy

- Proposed fix (e.g., "Update package X from 1.2.3 to 1.2.5")
- Why this approach is recommended
- Breaking changes or compatibility concerns
- Expected effort and complexity

### Alternative Options (Considered but Not Recommended)

- Other remediation approaches evaluated
- Why each was not chosen (trade-offs)

### Implementation Plan

- Specific steps to implement the fix
- Files/dependencies that need changes
- Testing requirements
- Rollback plan if issues arise

### Next Steps

- Slash command `/pr` to automatically trigger implementation
- The "Create PR from Design" workflow will handle the actual implementation
- Review and approval process

## 🎨 Customization

### Step Prompts

- `analyze-cve-and-plan.md` - Controls CVE analysis process, risk assessment criteria, and remediation evaluation
- `post-remediation-plan.md` - Controls how the plan is posted to issues and implementation is triggered

### Specialized Agents

This workflow uses a **specialized Security Engineer agent**. See `special agents/security-engineer-agent.md` for detailed configuration instructions, including:

- Role identity and security expertise areas
- Key principles for context-aware risk assessment
- Decision framework for evaluating remediation options
- Examples of good security analysis

Configure this agent in Overcut using the provided instructions to ensure accurate CVE analysis and practical remediation recommendations.

### Common Adjustments

**Adjust risk assessment criteria:**

Edit `analyze-cve-and-plan.md` Step 4 to:

- Emphasize specific vulnerability types (e.g., "Always treat auth/authz vulnerabilities as High risk")
- Add organizational security policies (e.g., "Flag all vulnerabilities in payment processing as Critical")
- Include compliance requirements (e.g., "Document PCI DSS implications for any data handling vulnerabilities")

**Change remediation preferences:**

Edit `analyze-cve-and-plan.md` Step 5 to:

- Prefer conservative updates: "Always recommend patch versions when available, avoid major updates"
- Allow breaking changes: "Consider major version updates if security benefit is significant"
- Prioritize speed: "Recommend quickest fix first, even if temporary workaround"

**Customize plan format:**

Edit `analyze-cve-and-plan.md` Step 7 to:

- Add custom sections: "Add compliance impact section for SOC 2 / PCI DSS"
- Include stakeholder notifications: "List teams that need to be notified"
- Add deployment requirements: "Specify maintenance window needs"

**Modify posting behavior:**

Edit `post-remediation-plan.md` to:

- Skip auto-trigger: "Don't post `/pr` command, let team manually trigger when ready"
- Add approvers: "Tag security team for review before implementation"
- Change format: "Use different emoji or formatting for better visibility"

## 🔄 Integration with Other Workflows

This workflow is designed to integrate seamlessly with existing playbooks:

1. **CVE Remediation** (this workflow) - Analyzes and creates plan
2. **[Create PR from Design](../create-pr-from-design/)** - Automatically triggered via `/pr` command to implement the plan
3. **[Code Review](../code-review/)** - Reviews the implementation PR (automatic or `/review`)

The remediation plan acts as a "design document" that feeds into the PR creation workflow, ensuring proper planning before implementation.

## 💡 Best Practices

### For Better Results

**Provide complete CVE information in the issue:**

- Include CVE ID (e.g., CVE-2024-12345)
- Paste security scanner output (Dependabot, Snyk, Trivy)
- Add links to official advisories if available
- Mention any affected services or components you're aware of

**Use appropriate labels:**

- `security-vulnerability` or `cve` for automatic triggering
- Add severity labels (`critical`, `high`, `medium`, `low`) if known
- Tag affected components (`backend`, `frontend`, `infrastructure`)

### During Workflow Execution

**Review the remediation plan carefully:**

- Check that the risk assessment matches your understanding
- Verify the recommended approach aligns with your deployment constraints
- Consider the breaking changes and compatibility concerns
- Ensure rollback plan is adequate for your environment

**Don't blindly auto-implement:**

- The `/pr` command triggers automatic implementation
- Review the plan with your security team first for critical vulnerabilities
- Consider your deployment schedule and change windows
- Ensure you have rollback capability before deploying

### After Implementation

**Verify the fix:**

- Run security scanners to confirm CVE is resolved
- Test affected functionality thoroughly
- Monitor for any unexpected behavior
- Update your vulnerability tracking system

**Document learnings:**

- Note any surprises in the actual vs. assessed risk
- Document any implementation challenges
- Share patterns with the team for future CVEs
- Update your security runbooks if needed

### Organizational Integration

**Set up automated scanning:**

- Configure Dependabot, Snyk, or Trivy to automatically create issues
- Ensure issues are labeled `security-vulnerability` for auto-triggering
- Set up notifications for critical CVEs

**Define response SLAs:**

- Critical: Remediate within 24-48 hours
- High: Remediate within 1 week
- Medium: Remediate within 2-4 weeks
- Low: Remediate in next regular maintenance cycle

**Security team review:**

- Establish which severity levels require security team approval
- Define who can approve and merge security fixes
- Set up monitoring for post-deployment verification

## 🔗 Related Workflows

- **[Create PR from Design](../create-pr-from-design/)** - Implements the remediation plan (triggered automatically)
- **[Code Review](../code-review/)** - Reviews the security fix PR (automatic or `/review`)
- **[Auto Root Cause Analysis](../auto-root-cause-analysis/)** - Can be used for understanding security incidents
- **[Auto Docs Update on Merge](../auto-docs-update-on-merge/)** - Updates security documentation after fixes are merged

---

_Part of the [Overcut Playbooks](../README.md) collection_
