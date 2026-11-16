# Infrastructure as Code (Terraform)

Terraform configuration to automate the provisioning of the AWS infrastructure for the monorepo application.

---

## Resources Provisioned

- **VPC & Networking**: Dedicated VPC (`10.0.0.0/16`), Public Subnet (`10.0.1.0/24`), Internet Gateway, and Route Table.
- **Security Group**: Inbound access for ports `22` (SSH), `80` (HTTP), `443` (HTTPS), `3000` (Web), `8080` (API), and `8081` (WS).
- **EC2 Instance**: Ubuntu 24.04 LTS on `t3.small` with 20 GB gp3 encrypted root volume.
- **Elastic IP (EIP)**: Static public IP attached to the instance.
- **Automated Bootstrapping (`user-data.sh`)**: Automatically configures 2 GB swap space, installs Docker, Docker Compose plugin, Nginx, and Certbot on first boot.

---

## Usage Instructions

### 1. Prerequisites
- [Terraform CLI](https://developer.hashicorp.com/terraform/install) (v1.5+) installed.
- AWS CLI configured with credentials (`aws configure`).

### 2. Configure Variables
Copy the example variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
```
Edit `terraform.tfvars` with your key name and preferred AWS region.

### 3. Initialize & Validate
```bash
terraform init
terraform validate
```

### 4. Review Execution Plan
```bash
terraform plan
```

### 5. Provision Infrastructure
```bash
terraform apply
```
Once complete, Terraform will output the public Elastic IP and SSH connection string.

### 6. Teardown (Clean up when finished)
To avoid unnecessary AWS costs:
```bash
terraform destroy
```
