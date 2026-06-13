terraform {
  backend "s3" {
    bucket  = "rampazzo-tfstate"
    key     = "news-reader.tfstate"
    region  = "eu-north-1"
    encrypt = true
  }
}
