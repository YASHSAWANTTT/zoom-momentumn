# EC2 Desktop Instance — Zoom App Testing

## Instance Details

| Resource | Value |
|---|---|
| Instance ID | `i-0abea5e15f8f33fde` |
| Region | `us-west-1` |
| Type | `t3.large` (2 vCPU, 8GB RAM) |
| AMI | `ami-06b527a1e4cb6f265` (Ubuntu 24.04) |
| Elastic IP | `54.177.27.179` |
| EIP Allocation | `eipalloc-0ee52c6a6aadbed79` |
| Key Pair | `zoom-momentum-dev` (`~/.ssh/zoom-momentum-dev.pem`) |
| Security Group | `zoom-momentum-desktop` (`sg-0571d54e64616298d`) |
| VPC | `vpc-03da568cd6807df07` (default, us-west-1) |
| EBS | 30GB gp3 |
| Termination Protection | Enabled |

## Tags (on all resources)

- `Project` = `zoom-momentum`
- `Team` = `zoom-fellows`
- `Owner` = `shitijmathur`

## Installed Software

- XFCE desktop environment
- NICE DCV server (remote desktop on port 8443)
- Node.js 20 LTS
- Zoom client
- Git, Firefox, curl, wget

## Connecting

**SSH:**
```bash
ssh -i ~/.ssh/zoom-momentum-dev.pem ubuntu@54.177.27.179
```

**Remote Desktop (NICE DCV):**
- URL: `https://54.177.27.179:8443`
- Username: `ubuntu`
- Password: `ZoomDev2026!` (change after first login with `sudo passwd ubuntu`)

## Running Claude Code with tmux

tmux lets you run Claude Code in a persistent session that survives SSH disconnects.

```bash
# SSH in (alias configured in ~/.zshrc)
ssh-next

# Start a new tmux session
tmux new -s claude

# Run Claude Code inside the session
claude

# Detach (leave running in background): Ctrl+b then d
# You can now safely disconnect from SSH

# Reattach later
tmux attach -t claude

# Other useful commands
tmux ls                    # List sessions
tmux kill-session -t claude  # Kill a session
```

## Agent Teams (Multi-Agent Swarm)

Agent teams let you run multiple Claude Code instances that coordinate via a shared task list and direct messaging. One session is the lead; the rest are teammates with their own context windows.

### Setup

1. Enable the experimental feature (on the EC2 instance):
```bash
# Add to Claude Code settings
mkdir -p ~/.claude
cat > ~/.claude/settings.json << 'EOF'
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "teammateMode": "tmux"
}
EOF
```

2. Start a tmux session and launch Claude Code:
```bash
tmux new -s swarm
claude
```

3. Tell Claude to create a team in natural language:
```
Create an agent team with 3 teammates to refactor the auth module.
One on backend routes, one on client hooks, one on tests.
```

Claude spawns teammates as separate tmux panes. Each gets its own context window and loads project CLAUDE.md automatically.

### Key commands

- **Shift+Down** — cycle through teammates (in-process mode)
- **Click pane** — interact with a teammate directly (split-pane/tmux mode)
- **Ctrl+T** — toggle the shared task list

### Tips

- Start with 3-5 teammates; more adds coordination overhead
- Aim for 5-6 tasks per teammate
- Avoid having two teammates edit the same file
- Use `--dangerously-skip-permissions` on the lead to avoid permission prompt bottlenecks
- Tell the lead to "wait for teammates to finish" if it starts doing work itself
- Always clean up via the lead: tell it "clean up the team" when done

### Cleanup

```
# In the lead session:
> Clean up the team

# If orphaned tmux sessions remain:
tmux ls
tmux kill-session -t <session-name>
```

## Security Group Rules

| Port | Protocol | Source | Description |
|---|---|---|---|
| 22 | TCP | `149.169.245.186/32` | SSH |
| 8443 | TCP | `149.169.245.186/32` | NICE DCV |

To update your IP if it changes:
```bash
MY_IP=$(curl -s https://checkip.amazonaws.com)/32

# Remove old rules
aws ec2 revoke-security-group-ingress --profile next-lab --region us-west-1 \
  --group-id sg-0571d54e64616298d \
  --ip-permissions \
    "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=OLD_IP/32}]" \
    "IpProtocol=tcp,FromPort=8443,ToPort=8443,IpRanges=[{CidrIp=OLD_IP/32}]"

# Add new rules
aws ec2 authorize-security-group-ingress --profile next-lab --region us-west-1 \
  --group-id sg-0571d54e64616298d \
  --ip-permissions \
    "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MY_IP,Description=SSH}]" \
    "IpProtocol=tcp,FromPort=8443,ToPort=8443,IpRanges=[{CidrIp=$MY_IP,Description=NICE-DCV}]"
```

## Cost

- t3.large: ~$0.0835/hr (~$60/month if running 24/7)
- 30GB gp3 EBS: ~$2.40/month
- Elastic IP (while attached): free
- Elastic IP (unattached): ~$0.005/hr

**Stop the instance when not in use:**
```bash
aws ec2 stop-instances --profile next-lab --region us-west-1 --instance-ids i-0abea5e15f8f33fde
aws ec2 start-instances --profile next-lab --region us-west-1 --instance-ids i-0abea5e15f8f33fde
```

## AWS Profile

All commands use `--profile next-lab` (account `741448917297`, user `shitijmathur`).
