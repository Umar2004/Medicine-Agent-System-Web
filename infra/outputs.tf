output "instance_id" {
  description = "EC2 Instance ID"
  value       = aws_instance.web.id
}

output "elastic_ip" {
  description = "Public IP — point your DNS A record here"
  value       = aws_eip.web.public_ip
}

output "ssh_command" {
  description = "SSH into your server"
  value       = "ssh ubuntu@${aws_eip.web.public_ip}"
}

output "dns_instruction" {
  description = "Update your Namecheap DNS"
  value       = "Set A record: medicineagent → ${aws_eip.web.public_ip}"
}
